import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, paginate, pageMeta } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { dateRange, localDate, startOfLocalDay, addDays } from '../lib/date.js';
import { scopedUserWhere, canAccessUser } from '../lib/scope.js';

const router = Router();

const CATEGORIES = ['CAR_GARAGE', 'BIKE_GARAGE', 'WASH_CENTER', 'RESTAURANT', 'GROCERY', 'OTHER'];
const STATUSES = ['OPEN', 'FOLLOW_UP', 'DEAL_DONE', 'LEAVE_OUT'];

const optStr = (max = 300) => z.string().trim().max(max).optional().nullable().transform((v) => (v === '' ? null : v));
const optNum = (min, max) => z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(min).max(max).nullable()).optional();
const optDate = z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.date().nullable()).optional();

const visitSchema = z.object({
  category: z.enum(CATEGORIES, { message: 'Select a business category' }),
  product: z.string().trim().min(1, 'Select a software product').max(100),
  companyName: z.string().trim().min(2, 'Business name is required').max(150),
  contactPerson: optStr(100),
  phone: z.string().trim().regex(/^[+\d][\d\s-]{6,18}$/, 'Enter a valid phone number'),
  email: z.string().trim().email().optional().nullable().or(z.literal('').transform(() => null)),
  status: z.enum(STATUSES).default('OPEN'),
  address: z.string().trim().min(3, 'Address is required').max(300),
  lat: optNum(-90, 90),
  lng: optNum(-180, 180),
  odometerKm: optNum(0, 9_999_999),
  dealValue: optNum(0, 1e12),
  nextFollowUp: optDate,
  notes: optStr(2000),
});
const updateSchema = visitSchema.partial().extend({ adminNote: optStr(2000) });

export async function buildVisitWhere(req) {
  const { q, status, category, from, to, product, followUpDue } = req.query;
  const where = {
    ...(await scopedUserWhere(req)),
    ...(STATUSES.includes(status) && { status }),
    ...(CATEGORIES.includes(category) && { category }),
    ...(product && { product }),
    ...(dateRange(from, to) && { visitedAt: dateRange(from, to) }),
    ...(q && {
      OR: [
        { companyName: { contains: q, mode: 'insensitive' } },
        { contactPerson: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { address: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };
  if (followUpDue === 'true') {
    where.status = 'FOLLOW_UP';
    where.nextFollowUp = { lt: startOfLocalDay(addDays(localDate(), 1)) };
  }
  return where;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pg = paginate(req.query);
    const where = await buildVisitWhere(req);
    const sortField = ['visitedAt', 'companyName', 'nextFollowUp', 'status'].includes(req.query.sort) ? req.query.sort : 'visitedAt';
    const dir = req.query.dir === 'asc' ? 'asc' : 'desc';
    const [total, rows, byStatus] = await Promise.all([
      prisma.visit.count({ where }),
      prisma.visit.findMany({
        where,
        include: { user: { select: { id: true, name: true, manager: { select: { name: true } } } } },
        orderBy: { [sortField]: dir },
        skip: pg.skip,
        take: pg.take,
      }),
      prisma.visit.groupBy({ by: ['status'], where: { ...where, status: undefined }, _count: true }),
    ]);
    res.json({
      data: rows,
      meta: pageMeta(total, pg),
      statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const visit = await prisma.visit.findUnique({ where: { id: req.params.id }, include: { user: { select: { id: true, name: true } } } });
    if (!visit || !(await canAccessUser(req, visit.userId))) throw new HttpError(404, 'Visit not found');
    res.json({ visit });
  }),
);

router.post(
  '/',
  validate(visitSchema),
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'FIELD_VISITOR') throw new HttpError(403, 'Only field visitors can log visits');
    const shift = await prisma.shift.findFirst({ where: { userId: req.user.id, status: 'ACTIVE' }, select: { id: true } });
    if (!shift) throw new HttpError(400, 'Start your day shift before logging a visit');
    const visit = await prisma.visit.create({ data: { ...req.body, userId: req.user.id, shiftId: shift.id } });
    if (req.body.lat != null && req.body.lng != null)
      await prisma.locationPing.create({ data: { userId: req.user.id, shiftId: shift.id, lat: req.body.lat, lng: req.body.lng } });
    res.status(201).json({ visit });
  }),
);

router.patch(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const visit = await prisma.visit.findUnique({ where: { id: req.params.id } });
    if (!visit || !(await canAccessUser(req, visit.userId))) throw new HttpError(404, 'Visit not found');
    const data = { ...req.body };
    // Guidance notes are written by managers/admins only
    if (req.user.role === 'FIELD_VISITOR') delete data.adminNote;
    // Strip undefined so partial updates don't clobber
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    const updated = await prisma.visit.update({ where: { id: visit.id }, data, include: { user: { select: { id: true, name: true } } } });
    res.json({ visit: updated });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const visit = await prisma.visit.findUnique({ where: { id: req.params.id } });
    if (!visit) throw new HttpError(404, 'Visit not found');
    if (req.user.role !== 'ADMIN') throw new HttpError(403, 'Only admins can delete visits');
    await prisma.visit.delete({ where: { id: visit.id } });
    res.json({ ok: true });
  }),
);

export default router;
