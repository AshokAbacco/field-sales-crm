import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { getFuelRate } from '../lib/settings.js';

const router = Router();

// ---------- Zones ----------
const zoneSchema = z.object({
  name: z.string().trim().min(2, 'Zone name is required').max(100),
  state: z.string().trim().min(2, 'State is required').max(60),
  district: z.string().trim().min(2, 'District is required').max(60),
  focusSegment: z.string().trim().max(100).optional().nullable(),
});

router.get(
  '/zones',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.zone.findMany({ include: { _count: { select: { users: true, teams: true } } }, orderBy: { name: 'asc' } });
    res.json({ data: rows });
  }),
);
router.post('/zones', requireRole('ADMIN'), validate(zoneSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ zone: await prisma.zone.create({ data: req.body }) });
}));
router.patch('/zones/:id', requireRole('ADMIN'), validate(zoneSchema.partial()), asyncHandler(async (req, res) => {
  res.json({ zone: await prisma.zone.update({ where: { id: req.params.id }, data: req.body }) });
}));
router.delete('/zones/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.zone.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ---------- Teams & targets ----------
const teamSchema = z.object({
  name: z.string().trim().min(2, 'Team name is required').max(100),
  zoneId: z.string().optional().nullable().transform((v) => v || null),
  visitsTarget: z.coerce.number().int().min(0).default(0),
  dealsTarget: z.coerce.number().int().min(0).default(0),
  revenueTarget: z.coerce.number().min(0).default(0),
  managerId: z.string().optional().nullable().transform((v) => v || null),
});

async function checkManager(managerId) {
  if (!managerId) return;
  const m = await prisma.user.findUnique({ where: { id: managerId }, select: { role: true } });
  if (m?.role !== 'MANAGER') throw new HttpError(400, 'Team lead must be a user with the Manager role');
}

router.get(
  '/teams',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.team.findMany({
      include: {
        zone: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true, _count: { select: { reports: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ data: rows });
  }),
);
router.post('/teams', requireRole('ADMIN'), validate(teamSchema), asyncHandler(async (req, res) => {
  await checkManager(req.body.managerId);
  res.status(201).json({ team: await prisma.team.create({ data: req.body }) });
}));
router.patch('/teams/:id', requireRole('ADMIN'), validate(teamSchema.partial()), asyncHandler(async (req, res) => {
  const data = { ...req.body };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  if (data.managerId) await checkManager(data.managerId);
  res.json({ team: await prisma.team.update({ where: { id: req.params.id }, data }) });
}));
router.delete('/teams/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.team.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

// ---------- Settings ----------
router.get('/settings', asyncHandler(async (_req, res) => {
  res.json({ fuelRatePerKm: await getFuelRate() });
}));
router.put(
  '/settings',
  requireRole('ADMIN'),
  validate(z.object({ fuelRatePerKm: z.coerce.number().min(0).max(1000) })),
  asyncHandler(async (req, res) => {
    await prisma.setting.upsert({
      where: { key: 'fuelRatePerKm' },
      update: { value: String(req.body.fuelRatePerKm) },
      create: { key: 'fuelRatePerKm', value: String(req.body.fuelRatePerKm) },
    });
    res.json({ fuelRatePerKm: req.body.fuelRatePerKm });
  }),
);

export default router;
