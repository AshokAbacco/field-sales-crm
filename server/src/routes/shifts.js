import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError, paginate, pageMeta } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { localDate, dateStrRange } from '../lib/date.js';
import { getFuelRate } from '../lib/settings.js';
import { scopedUserWhere, canAccessUser } from '../lib/scope.js';

const router = Router();

const coord = {
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
};

const startSchema = z.object({ startKm: z.coerce.number().min(0, 'Odometer must be positive').max(9_999_999), ...coord });
const endSchema = z.object({ endKm: z.coerce.number().min(0).max(9_999_999), ...coord });
const pingSchema = z.object({
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().min(0).optional().nullable(),
        recordedAt: z.coerce.date().optional(),
      }),
    )
    .min(1)
    .max(100),
});


/** Current user's shift for today */
router.get(
  '/today',
  asyncHandler(async (req, res) => {
    const shift = await prisma.shift.findUnique({
      where: { userId_date: { userId: req.user.id, date: localDate() } },
      include: { _count: { select: { visits: true } } },
    });
    // Also surface a forgotten shift from previous day
    const openPrevious = shift
      ? null
      : await prisma.shift.findFirst({ where: { userId: req.user.id, status: 'ACTIVE' }, orderBy: { startTime: 'desc' } });
    res.json({ shift, openPrevious, today: localDate() });
  }),
);

router.post(
  '/start',
  validate(startSchema),
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'FIELD_VISITOR') throw new HttpError(403, 'Only field employees punch in shifts');
    const today = localDate();
    const active = await prisma.shift.findFirst({ where: { userId: req.user.id, status: 'ACTIVE' } });
    if (active) throw new HttpError(409, active.date === today ? 'Your shift is already running' : `Please close your open shift from ${active.date} first`);
    const exists = await prisma.shift.findUnique({ where: { userId_date: { userId: req.user.id, date: today } } });
    if (exists) throw new HttpError(409, 'You have already completed a shift today');
    const { startKm, lat, lng, address } = req.body;
    const shift = await prisma.shift.create({
      data: { userId: req.user.id, date: today, startKm, startLat: lat, startLng: lng, startAddress: address },
    });
    if (lat != null && lng != null) await prisma.locationPing.create({ data: { userId: req.user.id, shiftId: shift.id, lat, lng } });
    res.status(201).json({ shift });
  }),
);

router.post(
  '/:id/end',
  validate(endSchema),
  asyncHandler(async (req, res) => {
    const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!shift || shift.userId !== req.user.id) throw new HttpError(404, 'Shift not found');
    if (shift.status !== 'ACTIVE') throw new HttpError(409, 'Shift already ended');
    const { endKm, lat, lng, address } = req.body;
    if (endKm < shift.startKm) throw new HttpError(400, `Closing reading must be at least ${shift.startKm} KM`);
    const distanceKm = Math.round((endKm - shift.startKm) * 10) / 10;
    if (distanceKm > 1000) throw new HttpError(400, 'Distance over 1000 KM in a day looks wrong. Please re-check the reading.');
    const fuelRate = await getFuelRate();
    const updated = await prisma.shift.update({
      where: { id: shift.id },
      data: {
        status: 'COMPLETED',
        endTime: new Date(),
        endKm,
        endLat: lat,
        endLng: lng,
        endAddress: address,
        distanceKm,
        fuelRate,
        allowance: Math.round(distanceKm * fuelRate * 100) / 100,
      },
    });
    if (lat != null && lng != null) await prisma.locationPing.create({ data: { userId: req.user.id, shiftId: shift.id, lat, lng } });
    res.json({ shift: updated });
  }),
);

/** Batched GPS pings while the shift is active */
router.post(
  '/:id/pings',
  validate(pingSchema),
  asyncHandler(async (req, res) => {
    const shift = await prisma.shift.findUnique({ where: { id: req.params.id }, select: { userId: true, status: true } });
    if (!shift || shift.userId !== req.user.id) throw new HttpError(404, 'Shift not found');
    if (shift.status !== 'ACTIVE') return res.json({ ok: true, ignored: true });
    await prisma.locationPing.createMany({
      data: req.body.points.map((p) => ({
        userId: req.user.id,
        shiftId: req.params.id,
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy ?? null,
        recordedAt: p.recordedAt ?? new Date(),
      })),
    });
    res.json({ ok: true });
  }),
);

/** List shifts (own for field visitor; all for admin) */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pg = paginate(req.query);
    const where = {
      ...(await scopedUserWhere(req)),
      ...(req.query.status && { status: req.query.status }),
      ...(dateStrRange(req.query.from, req.query.to) && { date: dateStrRange(req.query.from, req.query.to) }),
    };
    const [total, rows, sum] = await Promise.all([
      prisma.shift.count({ where }),
      prisma.shift.findMany({
        where,
        include: { user: { select: { id: true, name: true, district: true, bikeName: true, manager: { select: { name: true } } } }, _count: { select: { visits: true } } },
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
        skip: pg.skip,
        take: pg.take,
      }),
      prisma.shift.aggregate({ where, _sum: { distanceKm: true, allowance: true } }),
    ]);
    res.json({
      data: rows,
      meta: pageMeta(total, pg),
      totals: { distanceKm: sum._sum.distanceKm || 0, allowance: Number(sum._sum.allowance || 0) },
    });
  }),
);

/** Full route trace: start, GPS pings, visits, end */
router.get(
  '/:id/route',
  asyncHandler(async (req, res) => {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, name: true, bikeName: true } } },
    });
    if (!shift || !(await canAccessUser(req, shift.userId))) throw new HttpError(404, 'Shift not found');
    const [pings, visits] = await Promise.all([
      prisma.locationPing.findMany({
        where: { shiftId: shift.id },
        select: { lat: true, lng: true, recordedAt: true },
        orderBy: { recordedAt: 'asc' },
        take: 5000,
      }),
      prisma.visit.findMany({
        where: { shiftId: shift.id },
        select: { id: true, companyName: true, status: true, lat: true, lng: true, visitedAt: true, odometerKm: true, address: true, category: true },
        orderBy: { visitedAt: 'asc' },
      }),
    ]);
    res.json({ shift, pings, visits });
  }),
);

export default router;
