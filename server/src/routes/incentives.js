import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { isDateStr } from '../lib/date.js';
import { computeIncentives, currentMonth, isMonth, RULE_TYPES } from '../lib/incentives.js';

/**
 * Incentives
 *  - Rules: read by Admin & Managers, created/changed by Admin only
 *  - Report: Admin (all / per manager), Manager (self + team)
 *  - /me: any Field Employee or Manager – their own incentive
 *  - Payouts: Admin marks a month as paid (with optional adjustment)
 */
const router = Router();

const monthOf = (req) => (isMonth(req.query.month) ? req.query.month : currentMonth());
const optId = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
const optDay = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v == null || isDateStr(v), 'Use a valid date');
const optNum = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).nullable()).optional();

const ruleSchema = z
  .object({
    name: z.string().trim().min(2, 'Rule name is required').max(100),
    description: z.string().trim().max(300).optional().nullable().transform((v) => v || null),
    appliesTo: z.enum(['FIELD_VISITOR', 'MANAGER']).default('FIELD_VISITOR'),
    type: z.enum(Object.keys(RULE_TYPES)),
    rate: z.coerce.number({ invalid_type_error: 'Enter the incentive amount' }).min(0).max(1e9),
    every: optNum,
    minDeals: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().min(0).nullable()).optional(),
    maxPayout: optNum,
    planId: optId,
    productId: optId,
    categoryId: optId,
    effectiveFrom: optDay,
    effectiveTo: optDay,
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.type && RULE_TYPES[r.type]?.needsEvery && !(r.every > 0))
      ctx.addIssue({ path: ['every'], code: 'custom', message: r.type.includes('AMOUNT') || r.type.includes('REVENUE') ? 'Enter the ₹ amount' : 'Enter the number of deals' });
    if (r.type === 'PERCENT_OF_AMOUNT' && r.rate > 100) ctx.addIssue({ path: ['rate'], code: 'custom', message: 'Percentage cannot exceed 100' });
    if (r.effectiveFrom && r.effectiveTo && r.effectiveFrom > r.effectiveTo) ctx.addIssue({ path: ['effectiveTo'], code: 'custom', message: 'End date is before start date' });
  });

const ruleInclude = { plan: { select: { id: true, name: true } }, product: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } };

// ---------- rules ----------
router.get(
  '/rules',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const rows = await prisma.incentiveRule.findMany({
      where: req.user.role === 'MANAGER' ? { isActive: true } : {},
      include: ruleInclude,
      orderBy: [{ appliesTo: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ data: rows });
  }),
);

router.post(
  '/rules',
  requireRole('ADMIN'),
  validate(ruleSchema),
  asyncHandler(async (req, res) => {
    const data = { ...req.body };
    if (!RULE_TYPES[data.type].needsEvery) data.every = null;
    res.status(201).json({ rule: await prisma.incentiveRule.create({ data, include: ruleInclude }) });
  }),
);

router.patch(
  '/rules/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.incentiveRule.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, 'Rule not found');
    // Validate the merged rule so partial updates (e.g. toggle) keep it consistent
    const merged = {
      ...existing,
      rate: Number(existing.rate),
      every: existing.every != null ? Number(existing.every) : null,
      maxPayout: existing.maxPayout != null ? Number(existing.maxPayout) : null,
      ...req.body,
    };
    const parsed = ruleSchema.safeParse(merged);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const data = parsed.data;
    if (!RULE_TYPES[data.type].needsEvery) data.every = null;
    res.json({ rule: await prisma.incentiveRule.update({ where: { id: existing.id }, data, include: ruleInclude }) });
  }),
);

router.delete(
  '/rules/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.incentiveRule.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

// ---------- report ----------
async function reportUserIds(req) {
  if (req.user.role === 'MANAGER') {
    const team = await prisma.user.findMany({ where: { managerId: req.user.id }, select: { id: true } });
    return [req.user.id, ...team.map((t) => t.id)];
  }
  const where = { role: { in: ['FIELD_VISITOR', 'MANAGER'] } };
  if (req.query.managerId) where.OR = [{ id: String(req.query.managerId) }, { managerId: String(req.query.managerId) }];
  if (req.query.role === 'FIELD_VISITOR' || req.query.role === 'MANAGER') where.role = req.query.role;
  const users = await prisma.user.findMany({ where, select: { id: true } });
  return users.map((u) => u.id);
}

export async function buildIncentiveReport(req) {
  const month = monthOf(req);
  const rows = await computeIncentives({ month, userIds: await reportUserIds(req) });
  // Hide inactive users with nothing earned / paid
  const visible = rows.filter((r) => r.user.isActive || r.total > 0 || r.payout);
  visible.sort((a, b) => b.total - a.total || a.user.name.localeCompare(b.user.name));
  const sum = (f) => Math.round(visible.reduce((a, r) => a + f(r), 0) * 100) / 100;
  return {
    month,
    rows: visible,
    totals: {
      calculated: sum((r) => r.total),
      paid: sum((r) => (r.payout ? r.payout.amount : 0)),
      pending: sum((r) => (r.payout ? 0 : r.total)),
      earners: visible.filter((r) => r.total > 0).length,
      deals: sum((r) => (r.user.role === 'FIELD_VISITOR' ? r.deals : 0)),
    },
  };
}

router.get(
  '/report',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    res.json(await buildIncentiveReport(req));
  }),
);

router.get(
  '/me',
  requireRole('FIELD_VISITOR', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const month = monthOf(req);
    const [row] = await computeIncentives({ month, userIds: [req.user.id] });
    res.json({ month, ...row });
  }),
);

// ---------- payouts (admin) ----------
const payoutSchema = z.object({
  userId: z.string().min(1),
  month: z.string().refine(isMonth, 'Invalid month'),
  amount: z.coerce.number().min(0).max(1e10),
  note: z.string().trim().max(300).optional().nullable().transform((v) => v || null),
});

router.post(
  '/payouts',
  requireRole('ADMIN'),
  validate(payoutSchema),
  asyncHandler(async (req, res) => {
    const { userId, month, amount, note } = req.body;
    const [calc] = await computeIncentives({ month, userIds: [userId] });
    if (!calc) throw new HttpError(404, 'Employee not found');
    const data = { amount, calculated: calc.total, note, paidAt: new Date(), paidById: req.user.id };
    const payout = await prisma.incentivePayout.upsert({
      where: { userId_month: { userId, month } },
      update: data,
      create: { userId, month, ...data },
    });
    res.status(201).json({ payout });
  }),
);

router.delete(
  '/payouts/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.incentivePayout.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

export default router;
