import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, paginate, pageMeta } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { readSheet, phoneKey, cellValue, mapColumns, normHeader, sendTemplate } from '../lib/sheet.js';
import { linkVisitsByPhone } from '../lib/places.js';

/**
 * Places database – businesses to visit (hotels, restaurants, garages, schools…).
 * Everyone can search it; Admin & Managers add / edit / import.
 * Each place shows whether it was visited (any visit linked to it), by whom and the latest status.
 */
const router = Router();
const manage = requireRole('ADMIN', 'MANAGER');
const MAX_ROWS = 10000;
const STATUS_RANK = { DEAL_DONE: 4, FOLLOW_UP: 3, OPEN: 2, LEAVE_OUT: 1 };

const optStr = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optNum = (min, max) => z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(min).max(max).nullable()).optional();
const placeSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(150),
  categoryId: z.string().trim().optional().nullable().transform((v) => v || null),
  area: z.string().trim().min(2, 'Area / locality is required').max(100),
  city: optStr(80),
  pincode: optStr(12),
  address: optStr(300),
  phone: optStr(20).refine((v) => !v || phoneKey(v).length >= 7, 'Enter a valid phone number'),
  contactPerson: optStr(100),
  lat: optNum(-90, 90),
  lng: optNum(-180, 180),
  notes: optStr(1000),
  isActive: z.boolean().optional(),
});

const placeInclude = { category: { select: { id: true, name: true } }, createdBy: { select: { name: true } } };

/** Attach visited info to a page of places */
async function withVisitInfo(places, me) {
  if (!places.length) return [];
  const visits = await prisma.visit.findMany({
    where: { placeId: { in: places.map((p) => p.id) } },
    select: { placeId: true, status: true, visitedAt: true, userId: true, user: { select: { name: true } } },
    orderBy: { visitedAt: 'desc' },
  });
  const by = {};
  for (const v of visits) (by[v.placeId] ||= []).push(v);
  return places.map((p) => {
    const vs = by[p.id] || [];
    const best = vs.reduce((b, v) => (!b || STATUS_RANK[v.status] > STATUS_RANK[b] ? v.status : b), null);
    return {
      ...p,
      visit: vs.length
        ? {
            count: vs.length,
            lastAt: vs[0].visitedAt,
            lastBy: vs[0].user?.name,
            lastStatus: vs[0].status,
            bestStatus: best,
            byMe: vs.some((v) => v.userId === me),
            people: [...new Set(vs.map((v) => v.user?.name).filter(Boolean))].slice(0, 5),
          }
        : null,
    };
  });
}

const distanceKm = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

function baseWhere(req) {
  const { q, categoryId, area, pincode, inactive } = req.query;
  const showInactive = inactive === 'true' && req.user.role !== 'FIELD_VISITOR';
  const where = { ...(!showInactive && { isActive: true }) };
  if (categoryId === 'none') where.categoryId = null;
  else if (categoryId) where.categoryId = String(categoryId);
  if (area) where.area = { contains: String(area).trim(), mode: 'insensitive' };
  if (pincode) where.pincode = String(pincode).trim();
  if (q && String(q).trim()) {
    const t = String(q).trim();
    where.OR = [
      { name: { contains: t, mode: 'insensitive' } },
      { area: { contains: t, mode: 'insensitive' } },
      { address: { contains: t, mode: 'insensitive' } },
      { city: { contains: t, mode: 'insensitive' } },
      { pincode: { startsWith: t } },
      { phone: { contains: t } },
      { contactPerson: { contains: t, mode: 'insensitive' } },
    ];
  }
  return where;
}

const visitedWhere = (visited, me) =>
  visited === 'no' ? { visits: { none: {} } } : visited === 'yes' ? { visits: { some: {} } } : visited === 'mine' ? { visits: { some: { userId: me } } } : {};

// ---------- search ----------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pg = paginate(req.query);
    const me = req.user.id;
    const base = baseWhere(req);
    const where = { ...base, ...visitedWhere(req.query.visited, me) };

    // "Near me": bounding box in SQL, exact distance + sort in memory (capped)
    const [nlat, nlng] = String(req.query.near || '').split(',').map(Number);
    const near = Number.isFinite(nlat) && Number.isFinite(nlng) ? { lat: nlat, lng: nlng } : null;
    const radius = Math.min(50, Math.max(0.5, Number(req.query.radiusKm) || 3));

    let total;
    let rows;
    if (near) {
      const dLat = radius / 111;
      const dLng = radius / (111 * Math.cos((near.lat * Math.PI) / 180));
      const boxed = { ...where, lat: { gte: near.lat - dLat, lte: near.lat + dLat }, lng: { gte: near.lng - dLng, lte: near.lng + dLng } };
      const all = await prisma.place.findMany({ where: boxed, include: placeInclude, take: 2000 });
      const sorted = all
        .map((p) => ({ ...p, distanceKm: Math.round(distanceKm(near, p) * 100) / 100 }))
        .filter((p) => p.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      total = sorted.length;
      rows = sorted.slice(pg.skip, pg.skip + pg.take);
    } else {
      [total, rows] = await Promise.all([
        prisma.place.count({ where }),
        prisma.place.findMany({ where, include: placeInclude, orderBy: [{ area: 'asc' }, { name: 'asc' }], skip: pg.skip, take: pg.take }),
      ]);
    }

    // Chip counts for the current search (ignoring the visited filter)
    const [all, visited, mine] = near
      ? [null, null, null]
      : await Promise.all([
          prisma.place.count({ where: base }),
          prisma.place.count({ where: { ...base, visits: { some: {} } } }),
          prisma.place.count({ where: { ...base, visits: { some: { userId: me } } } }),
        ]);

    res.json({
      data: await withVisitInfo(rows, me),
      meta: pageMeta(total, pg),
      counts: all == null ? null : { all, visited, notVisited: all - visited, mine },
    });
  }),
);

/** Areas with place counts – for the area picker / autocomplete */
router.get(
  '/areas',
  asyncHandler(async (req, res) => {
    const rows = await prisma.place.groupBy({
      by: ['area'],
      where: { isActive: true, area: { not: null }, ...(req.query.categoryId && { categoryId: String(req.query.categoryId) }) },
      _count: { _all: true },
      orderBy: { area: 'asc' },
      take: 1000,
    });
    res.json({ data: rows.map((r) => ({ area: r.area, count: r._count._all })) });
  }),
);

router.get(
  '/template',
  manage,
  asyncHandler(async (req, res) => {
    const cats = await prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { name: true } });
    await sendTemplate(res, req.query.format === 'xlsx' ? 'xlsx' : 'csv', 'places-template', COLUMNS, [
      ['Category', cats.map((c) => c.name).join(', ') + ' (add new ones in Settings → Business categories)'],
      ['Area', 'Locality employees will search by, e.g. Vidyaranyapura'],
      ['Latitude / Longitude', 'Optional – enables “Near me” and the map. Example: 13.0827, 77.5513'],
      ['Duplicates', 'Same name in the same area, or same phone, is skipped'],
    ]);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const place = await prisma.place.findUnique({ where: { id: req.params.id }, include: placeInclude });
    if (!place || (!place.isActive && req.user.role === 'FIELD_VISITOR')) throw new HttpError(404, 'Place not found');
    const [withInfo] = await withVisitInfo([place], req.user.id);
    const visits = await prisma.visit.findMany({
      where: { placeId: place.id },
      select: { id: true, status: true, visitedAt: true, notes: true, dealValue: true, planName: true, nextFollowUp: true, user: { select: { name: true } } },
      orderBy: { visitedAt: 'desc' },
      take: 20,
    });
    res.json({ place: withInfo, visits });
  }),
);

// ---------- add / edit / delete (admin, manager) ----------
async function assertNotDuplicate({ name, area }, exceptId) {
  const dup = await prisma.place.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, area: { equals: area, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true, isActive: true },
  });
  if (dup) throw new HttpError(409, `“${name}” already exists in ${area}${dup.isActive ? '' : ' (inactive)'}`);
}

router.post(
  '/',
  manage,
  validate(placeSchema),
  asyncHandler(async (req, res) => {
    await assertNotDuplicate(req.body);
    const place = await prisma.place.create({ data: { ...req.body, createdById: req.user.id }, include: placeInclude });
    if (place.phone) await linkVisitsByPhone({ placeIds: [place.id] });
    res.status(201).json({ place });
  }),
);

router.patch(
  '/:id',
  manage,
  validate(placeSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.place.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Place not found');
    const data = { ...req.body };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    if (data.name || data.area) await assertNotDuplicate({ name: data.name ?? existing.name, area: data.area ?? existing.area }, existing.id);
    const place = await prisma.place.update({ where: { id: existing.id }, data, include: placeInclude });
    if (data.phone) await linkVisitsByPhone({ placeIds: [place.id] });
    res.json({ place });
  }),
);

router.delete(
  '/:id',
  manage,
  asyncHandler(async (req, res) => {
    const visits = await prisma.visit.count({ where: { placeId: req.params.id } });
    if (visits > 0) {
      await prisma.place.update({ where: { id: req.params.id }, data: { isActive: false } });
      return res.json({ ok: true, deactivated: true });
    }
    await prisma.place.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// ---------- import (admin, manager) ----------
const COLUMNS = [
  { key: 'name', header: 'Name', required: true, aliases: ['business name', 'place name', 'shop name', 'hotel name', 'company', 'business'], example: 'Sri Sai Garage' },
  { key: 'category', header: 'Category', aliases: ['type', 'business type', 'business category'], example: 'Car Garage' },
  { key: 'area', header: 'Area', required: true, aliases: ['locality', 'location', 'area name', 'zone'], example: 'Vidyaranyapura' },
  { key: 'city', header: 'City', aliases: ['town', 'district'], example: 'Bengaluru' },
  { key: 'pincode', header: 'Pincode', aliases: ['pin', 'pin code', 'zip', 'postal code'], example: '560097' },
  { key: 'address', header: 'Address', aliases: ['full address', 'street'], example: '5th Main, BEL Layout' },
  { key: 'phone', header: 'Phone', aliases: ['mobile', 'contact number', 'phone number'], example: '9876543210' },
  { key: 'contactPerson', header: 'Contact Person', aliases: ['owner', 'contact', 'owner name'], example: 'Ravi' },
  { key: 'lat', header: 'Latitude', aliases: ['lat'], example: '' },
  { key: 'lng', header: 'Longitude', aliases: ['lng', 'long', 'lon'], example: '' },
  { key: 'notes', header: 'Notes', aliases: ['remarks', 'comment'], example: '' },
];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post(
  '/import',
  manage,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Choose a CSV or Excel file to upload');
    const dryRun = req.body.dryRun !== 'false';
    const table = await readSheet(req.file);
    if (table.length < 2) throw new HttpError(400, 'The file has no data rows. First row must be the column headers.');
    const col = mapColumns(table[0], COLUMNS);
    const missing = COLUMNS.filter((c) => c.required && col[c.key] == null).map((c) => c.header);
    if (missing.length) throw new HttpError(400, `Missing required column(s): ${missing.join(', ')}. Download the template to see the format.`);
    const body = table.slice(1);
    if (body.length > MAX_ROWS) throw new HttpError(400, `Too many rows (${body.length}). Import at most ${MAX_ROWS} rows per file.`);

    const cats = await prisma.category.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const catBy = new Map(cats.map((c) => [normHeader(c.name), c]));

    const rows = body.map((r, i) => {
      const str = (k) => (col[k] != null ? String(cellValue(r[col[k]]) ?? '').trim() : '');
      const errors = [];
      const warnings = [];
      const name = str('name');
      const area = str('area');
      if (name.length < 2) errors.push('Name missing');
      if (area.length < 2) errors.push('Area missing');
      let category = null;
      if (str('category')) {
        category = catBy.get(normHeader(str('category'))) || null;
        if (!category) warnings.push(`Unknown category "${str('category')}" – add it in Settings or it stays blank`);
      }
      let phone = str('phone').replace(/\.0$/, '');
      if (phone && phoneKey(phone).length < 7) {
        warnings.push('Phone looks invalid – skipped');
        phone = '';
      }
      const num = (k, min, max) => {
        if (!str(k)) return null;
        const n = Number(str(k));
        if (!Number.isFinite(n) || n < min || n > max) {
          warnings.push(`${k === 'lat' ? 'Latitude' : 'Longitude'} invalid – skipped`);
          return null;
        }
        return n;
      };
      return {
        row: i + 2,
        errors,
        warnings,
        data: {
          id: crypto.randomUUID(),
          name: name.slice(0, 150),
          area: area.slice(0, 100),
          categoryId: category?.id || null,
          city: str('city').slice(0, 80) || null,
          pincode: str('pincode').replace(/\.0$/, '').slice(0, 12) || null,
          address: str('address').slice(0, 300) || null,
          phone: phone.slice(0, 20) || null,
          contactPerson: str('contactPerson').slice(0, 100) || null,
          lat: num('lat', -90, 90),
          lng: num('lng', -180, 180),
          notes: str('notes').slice(0, 1000) || null,
        },
        category: category?.name || '—',
      };
    });

    // Duplicates: same name+area or same phone – in the database or earlier in the file
    const areas = [...new Set(rows.map((r) => r.data.area).filter(Boolean))];
    const existing = areas.length
      ? await prisma.place.findMany({ where: { area: { in: areas, mode: 'insensitive' } }, select: { name: true, area: true } })
      : [];
    const nameKey = (n, a) => `${normHeader(n)}|${normHeader(a)}`;
    const existingNames = new Set(existing.map((p) => nameKey(p.name, p.area)));
    const phones = [...new Set(rows.map((r) => phoneKey(r.data.phone)).filter((k) => k.length >= 7))];
    const existingPhones = new Set();
    for (let i = 0; i < phones.length; i += 1000) {
      const found = await prisma.$queryRaw`
        SELECT DISTINCT right(regexp_replace("phone", '\\D', '', 'g'), 10) AS k FROM "Place"
        WHERE "phone" IS NOT NULL AND right(regexp_replace("phone", '\\D', '', 'g'), 10) = ANY(${phones.slice(i, i + 1000)})`;
      found.forEach((f) => existingPhones.add(f.k));
    }
    const seenNames = new Set();
    const seenPhones = new Set();
    for (const r of rows) {
      if (r.errors.length) continue;
      const nk = nameKey(r.data.name, r.data.area);
      const pk = phoneKey(r.data.phone);
      if (existingNames.has(nk)) r.duplicate = 'Already in database';
      else if (pk.length >= 7 && existingPhones.has(pk)) r.duplicate = 'Phone already in database';
      else if (seenNames.has(nk) || (pk.length >= 7 && seenPhones.has(pk))) r.duplicate = 'Repeated in file';
      seenNames.add(nk);
      if (pk.length >= 7) seenPhones.add(pk);
    }

    const importable = rows.filter((r) => !r.errors.length && !r.duplicate);
    const summary = {
      total: rows.length,
      invalid: rows.filter((r) => r.errors.length).length,
      duplicates: rows.filter((r) => r.duplicate).length,
      toImport: importable.length,
      areas: new Set(importable.map((r) => normHeader(r.data.area))).size,
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
          name: r.data.name,
          area: r.data.area,
          category: r.category,
          phone: r.data.phone,
          hasLocation: r.data.lat != null && r.data.lng != null,
        })),
      });
    }
    if (!importable.length) throw new HttpError(400, 'Nothing new to import');
    let created = 0;
    for (let i = 0; i < importable.length; i += 1000) {
      const out = await prisma.place.createMany({ data: importable.slice(i, i + 1000).map((r) => ({ ...r.data, createdById: req.user.id })) });
      created += out.count;
    }
    const withPhone = importable.filter((r) => r.data.phone).map((r) => r.data.id);
    for (let i = 0; i < withPhone.length; i += 1000) await linkVisitsByPhone({ placeIds: withPhone.slice(i, i + 1000) });
    res.status(201).json({ dryRun: false, summary: { ...summary, created } });
  }),
);

export default router;
