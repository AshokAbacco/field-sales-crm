import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { canAssignTo } from '../lib/scope.js';
import { visitSchema, resolveCatalog, visitInclude } from './visits.js';

/**
 * Self-sourced leads for Managers (and Admin):
 *  - POST /api/leads            add one lead manually
 *  - GET  /api/leads/template   download the import template (csv | xlsx)
 *  - POST /api/leads/import     upload CSV / Excel; dryRun=true returns a preview, otherwise imports
 * Leads can be kept by the uploader or assigned to an employee; they then appear in the normal
 * visits pipeline where they are converted to follow-ups / deals.
 */
const router = Router();
router.use(requireRole('ADMIN', 'MANAGER'));

const MAX_ROWS = 5000;
const STATUS_ALIASES = {
  open: 'OPEN', new: 'OPEN', lead: 'OPEN',
  'follow-up': 'FOLLOW_UP', 'follow up': 'FOLLOW_UP', followup: 'FOLLOW_UP', follow_up: 'FOLLOW_UP',
  'deal done': 'DEAL_DONE', deal: 'DEAL_DONE', won: 'DEAL_DONE', closed: 'DEAL_DONE', deal_done: 'DEAL_DONE', customer: 'DEAL_DONE', client: 'DEAL_DONE',
  'leave out': 'LEAVE_OUT', lost: 'LEAVE_OUT', 'not interested': 'LEAVE_OUT', leave_out: 'LEAVE_OUT',
};
const CYCLE_ALIASES = {
  monthly: 'MONTHLY', month: 'MONTHLY', quarterly: 'QUARTERLY', quarter: 'QUARTERLY',
  'half-yearly': 'HALF_YEARLY', 'half yearly': 'HALF_YEARLY', half_yearly: 'HALF_YEARLY', yearly: 'YEARLY', annual: 'YEARLY', year: 'YEARLY',
  'one-time': 'ONE_TIME', 'one time': 'ONE_TIME', onetime: 'ONE_TIME', one_time: 'ONE_TIME',
};

// Template columns. `key` is matched case-insensitively against header names (aliases allowed).
const COLUMNS = [
  { key: 'companyName', header: 'Business Name', required: true, aliases: ['business', 'company', 'company name', 'client', 'client name', 'shop name', 'name'], example: 'Speed Auto Garage' },
  { key: 'phone', header: 'Phone', required: true, aliases: ['mobile', 'phone number', 'contact number', 'mobile number'], example: '9876543210' },
  { key: 'contactPerson', header: 'Contact Person', aliases: ['owner', 'contact', 'owner name'], example: 'Ravi Kumar' },
  { key: 'email', header: 'Email', aliases: ['email id', 'mail'], example: 'ravi@example.com' },
  { key: 'address', header: 'Address', aliases: ['location', 'area'], example: 'Koramangala, Bengaluru' },
  { key: 'category', header: 'Category', aliases: ['business category', 'type'], example: 'Car Garage' },
  { key: 'product', header: 'Software', aliases: ['product', 'software pitched'], example: 'Motor Desk' },
  { key: 'status', header: 'Status', aliases: ['stage', 'lead status'], example: 'Follow-Up' },
  { key: 'nextFollowUp', header: 'Next Follow Up', aliases: ['follow up date', 'followup date', 'next followup'], example: '2026-10-15' },
  { key: 'plan', header: 'Plan', aliases: ['plan name', 'package'], example: '' },
  { key: 'dealValue', header: 'Plan Amount', aliases: ['amount', 'deal value', 'price', 'value'], example: '' },
  { key: 'billingCycle', header: 'Billing Cycle', aliases: ['cycle', 'billing'], example: '' },
  { key: 'nextPaymentDate', header: 'Next Payment Date', aliases: ['next payment', 'renewal date', 'payment date'], example: '' },
  { key: 'notes', header: 'Notes', aliases: ['remarks', 'comment', 'comments'], example: 'Interested, call after 6 PM' },
  { key: 'assignTo', header: 'Assign To (email)', aliases: ['assign to', 'assigned to', 'employee email', 'owner email'], example: '' },
];
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// ---------- parsing ----------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

const cellValue = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text);
    if (v.result != null) return v.result;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.hyperlink) return String(v.text || v.hyperlink).replace(/^mailto:/, '');
  }
  return v;
};

async function readSheet(file) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv') || file.mimetype === 'text/csv') return parseCsv(file.buffer.toString('utf8'));
  if (!name.endsWith('.xlsx')) throw new HttpError(400, 'Upload a .csv or .xlsx file (old .xls is not supported – re-save as .xlsx)');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.read(Readable.from(file.buffer));
  } catch {
    throw new HttpError(400, 'Could not read the Excel file. Please re-save it as .xlsx and try again.');
  }
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = [];
    for (let i = 1; i <= Math.max(r.cellCount, ws.columnCount); i++) vals.push(cellValue(r.getCell(i).value));
    if (vals.some((v) => String(v).trim() !== '')) rows.push(vals);
  });
  return rows;
}

/** Accepts Date, YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, Excel serial numbers */
function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? undefined : v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000));
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
    return isNaN(d) ? undefined : d;
  }
  return undefined;
}

const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-10);

async function loadLookups(req) {
  const [categories, products, plans, assignees] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.plan.findMany({ where: { isActive: true } }),
    prisma.user.findMany({
      where:
        req.user.role === 'ADMIN'
          ? { isActive: true, role: { in: ['FIELD_VISITOR', 'MANAGER'] } }
          : { isActive: true, OR: [{ id: req.user.id }, { managerId: req.user.id }] },
      select: { id: true, email: true, name: true },
    }),
  ]);
  if (!categories.length || !products.length) throw new HttpError(400, 'Add at least one business category and software product in Settings first');
  return {
    categories,
    products,
    plans,
    catBy: new Map(categories.map((c) => [norm(c.name), c])),
    prodBy: new Map(products.map((p) => [norm(p.name), p])),
    assigneeBy: new Map(assignees.flatMap((a) => [[norm(a.email), a], [norm(a.name), a]])),
    fallbackCat: categories.find((c) => norm(c.name) === 'other') || categories[categories.length - 1],
  };
}

/** Turn raw sheet rows into validated lead records */
function normaliseRows(table, lk, defaultAssignee) {
  if (table.length < 2) throw new HttpError(400, 'The file has no data rows. Use the template: first row = column headers.');
  const header = table[0].map(norm);
  const colIndex = {};
  for (const col of COLUMNS) {
    const names = [norm(col.header), norm(col.key), ...col.aliases];
    const idx = header.findIndex((h) => names.includes(h) || names.includes(h.replace(/\s*\*$/, '')));
    if (idx >= 0) colIndex[col.key] = idx;
  }
  const missing = COLUMNS.filter((c) => c.required && colIndex[c.key] == null).map((c) => c.header);
  if (missing.length) throw new HttpError(400, `Missing required column(s): ${missing.join(', ')}. Download the template to see the expected format.`);
  const body = table.slice(1);
  if (body.length > MAX_ROWS) throw new HttpError(400, `Too many rows (${body.length}). Import at most ${MAX_ROWS} rows per file.`);

  return body.map((r, i) => {
    const get = (k) => (colIndex[k] != null ? cellValue(r[colIndex[k]]) : '');
    const str = (k) => String(get(k) ?? '').trim();
    const errors = [];
    const warnings = [];

    const companyName = str('companyName');
    if (companyName.length < 2) errors.push('Business name missing');
    let phone = str('phone').replace(/\.0$/, '');
    if (phoneKey(phone).length < 7) errors.push('Phone missing or invalid');

    let category = lk.catBy.get(norm(str('category')));
    if (!category) {
      if (str('category')) warnings.push(`Unknown category "${str('category')}" → ${lk.fallbackCat.name}`);
      category = lk.fallbackCat;
    }
    let product = lk.prodBy.get(norm(str('product')));
    if (!product) {
      product = lk.products.find((p) => p.id === category.defaultProductId) || lk.products[0];
      if (str('product')) warnings.push(`Unknown software "${str('product')}" → ${product.name}`);
    }

    let status = 'OPEN';
    if (str('status')) {
      status = STATUS_ALIASES[norm(str('status'))] || STATUS_ALIASES[norm(str('status')).replace(/_/g, ' ')];
      if (!status) {
        warnings.push(`Unknown status "${str('status')}" → Open`);
        status = 'OPEN';
      }
    }

    const nextFollowUp = parseDate(get('nextFollowUp'));
    if (nextFollowUp === undefined) warnings.push('Follow-up date not understood (use YYYY-MM-DD or DD/MM/YYYY)');
    if (status === 'FOLLOW_UP' && !nextFollowUp) warnings.push('Follow-up without a date');

    // Deal / plan details
    let planId = null;
    let planName = null;
    let billingCycle = CYCLE_ALIASES[norm(str('billingCycle'))] || null;
    if (str('billingCycle') && !billingCycle) warnings.push(`Unknown billing cycle "${str('billingCycle')}"`);
    let dealValue = str('dealValue') !== '' ? Number(String(get('dealValue')).replace(/[₹,\s]/g, '')) : null;
    if (dealValue != null && (!isFinite(dealValue) || dealValue < 0)) {
      warnings.push('Plan amount is not a number');
      dealValue = null;
    }
    const nextPaymentDate = parseDate(get('nextPaymentDate'));
    if (nextPaymentDate === undefined) warnings.push('Next payment date not understood');
    if (str('plan')) {
      const plan =
        lk.plans.find((p) => norm(p.name) === norm(str('plan')) && p.productId === product.id) ||
        lk.plans.find((p) => norm(p.name) === norm(str('plan')));
      if (plan) {
        planId = plan.id;
        planName = plan.name;
        billingCycle ||= plan.billingCycle;
        if (dealValue == null) dealValue = Number(plan.price);
      } else {
        planName = str('plan');
        warnings.push(`Plan "${str('plan')}" not found – saved as custom plan name`);
      }
    }
    if (status === 'DEAL_DONE' && dealValue == null) errors.push('Deal Done needs a Plan or Plan Amount');

    let assignee = defaultAssignee;
    if (str('assignTo')) {
      const a = lk.assigneeBy.get(norm(str('assignTo')));
      if (a) assignee = a;
      else warnings.push(`"${str('assignTo')}" is not in your team – assigned to default`);
    }
    if (!assignee) errors.push('No one to assign this lead to');

    const email = str('email');
    return {
      row: i + 2,
      errors,
      warnings,
      data: {
        companyName: companyName.slice(0, 150),
        phone: phone.slice(0, 20),
        contactPerson: str('contactPerson').slice(0, 100) || null,
        email: /^\S+@\S+\.\S+$/.test(email) ? email.slice(0, 150) : null,
        address: str('address').slice(0, 300) || '—',
        categoryId: category.id,
        productId: product.id,
        product: product.name,
        status,
        nextFollowUp: nextFollowUp || null,
        planId,
        planName,
        billingCycle: status === 'DEAL_DONE' ? billingCycle : null,
        dealValue: status === 'DEAL_DONE' || dealValue != null ? dealValue : null,
        nextPaymentDate: status === 'DEAL_DONE' ? nextPaymentDate || null : null,
        notes: str('notes').slice(0, 2000) || null,
        userId: assignee?.id,
      },
      display: { category: category.name, product: product.name, assignee: assignee?.name || '—' },
    };
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ---------- routes ----------
const leadSchema = visitSchema.extend({
  assignToId: z.string().trim().optional().nullable(),
  address: z.string().trim().max(300).optional().nullable().transform((v) => v || '—'),
});

router.post(
  '/',
  validate(leadSchema),
  asyncHandler(async (req, res) => {
    const { assignToId, lat: _lat, lng: _lng, odometerKm: _km, ...rest } = req.body;
    const ownerId = assignToId || req.user.id;
    if (!(await canAssignTo(req, ownerId))) throw new HttpError(400, 'You cannot assign this lead to that person');
    const data = await resolveCatalog({ ...rest });
    const visit = await prisma.visit.create({
      data: { ...data, userId: ownerId, source: 'MANUAL', createdById: req.user.id },
      include: visitInclude,
    });
    res.status(201).json({ visit });
  }),
);

router.get(
  '/template',
  asyncHandler(async (req, res) => {
    const [cats, prods, plans] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { name: true } }),
      prisma.product.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { name: true } }),
      prisma.plan.findMany({ where: { isActive: true }, select: { name: true, price: true, billingCycle: true, product: { select: { name: true } } } }),
    ]);
    const headers = COLUMNS.map((c) => (c.required ? `${c.header} *` : c.header));
    const example = COLUMNS.map((c) => c.example);
    if (req.query.format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="lead-import-template.xlsx"');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = headers.map((h) => ({ header: h, width: Math.max(14, h.length + 4) }));
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      ws.addRow(example);
      const help = wb.addWorksheet('Allowed values');
      help.columns = [{ header: 'Field', width: 22 }, { header: 'Allowed values', width: 80 }];
      help.getRow(1).font = { bold: true };
      [
        ['Category', cats.map((c) => c.name).join(', ')],
        ['Software', prods.map((p) => p.name).join(', ')],
        ['Status', 'Open, Follow-Up, Deal Done, Leave Out'],
        ['Plan', plans.map((p) => `${p.name}${p.product ? ` (${p.product.name})` : ''} – ₹${Number(p.price)}`).join(', ') || 'Add plans in Settings'],
        ['Billing Cycle', 'Monthly, Quarterly, Half-yearly, Yearly, One-time'],
        ['Dates', 'YYYY-MM-DD or DD/MM/YYYY'],
        ['Assign To (email)', 'Email of the employee who will own the lead. Leave empty to use the default chosen while uploading.'],
        ['Deal Done rows', 'Need Plan or Plan Amount'],
      ].forEach((r) => help.addRow(r));
      await wb.xlsx.write(res);
      return res.end();
    }
    const esc = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lead-import-template.csv"');
    res.send('﻿' + [headers, example].map((r) => r.map(esc).join(',')).join('\n') + '\n');
  }),
);

router.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a CSV or Excel file to upload');
    const dryRun = req.body.dryRun !== 'false';
    const skipDuplicates = req.body.skipDuplicates !== 'false';
    const defaultId = req.body.assignToId || req.user.id;
    if (!(await canAssignTo(req, defaultId))) throw new HttpError(400, 'You cannot assign leads to that person');

    const lk = await loadLookups(req);
    const defaultAssignee = [...lk.assigneeBy.values()].find((a) => a.id === defaultId);
    const table = await readSheet(req.file);
    const rows = normaliseRows(table, lk, defaultAssignee);

    // Duplicate detection by last 10 digits of phone – within the file and against existing leads
    const keys = [...new Set(rows.map((r) => phoneKey(r.data.phone)).filter((k) => k.length >= 7))];
    const existing = new Set();
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      const found = await prisma.$queryRaw`
        SELECT DISTINCT right(regexp_replace("phone", '\\D', '', 'g'), 10) AS k
        FROM "Visit" WHERE right(regexp_replace("phone", '\\D', '', 'g'), 10) = ANY(${chunk})`;
      found.forEach((f) => existing.add(f.k));
    }
    const seen = new Set();
    for (const r of rows) {
      const k = phoneKey(r.data.phone);
      if (r.errors.length || k.length < 7) continue;
      if (existing.has(k)) r.duplicate = 'Already in CRM';
      else if (seen.has(k)) r.duplicate = 'Repeated in file';
      seen.add(k);
    }

    const importable = rows.filter((r) => !r.errors.length && !(skipDuplicates && r.duplicate));
    const summary = {
      total: rows.length,
      valid: rows.filter((r) => !r.errors.length).length,
      invalid: rows.filter((r) => r.errors.length).length,
      duplicates: rows.filter((r) => r.duplicate).length,
      toImport: importable.length,
      byStatus: importable.reduce((a, r) => ((a[r.data.status] = (a[r.data.status] || 0) + 1), a), {}),
    };

    if (dryRun) {
      return res.json({
        dryRun: true,
        summary,
        rows: rows.slice(0, 500).map((r) => ({
          row: r.row,
          errors: r.errors,
          warnings: r.warnings,
          duplicate: r.duplicate || null,
          companyName: r.data.companyName,
          phone: r.data.phone,
          status: r.data.status,
          dealValue: r.data.dealValue,
          planName: r.data.planName,
          nextFollowUp: r.data.nextFollowUp,
          ...r.display,
        })),
      });
    }

    if (!importable.length) throw new HttpError(400, 'Nothing to import – fix the errors or untick "skip duplicates"');
    const now = new Date();
    let created = 0;
    for (let i = 0; i < importable.length; i += 500) {
      const batch = importable.slice(i, i + 500).map((r) => ({
        ...r.data,
        source: 'IMPORT',
        createdById: req.user.id,
        visitedAt: now,
        dealClosedAt: r.data.status === 'DEAL_DONE' ? now : null,
      }));
      const out = await prisma.visit.createMany({ data: batch });
      created += out.count;
    }
    res.status(201).json({ dryRun: false, summary: { ...summary, created } });
  }),
);

export default router;
