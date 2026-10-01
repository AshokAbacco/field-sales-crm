import { Router } from 'express';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { asyncHandler, HttpError, paginate, pageMeta } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
// Admin: full access. Manager: only their own field employees.
router.use(requireRole('ADMIN', 'MANAGER'));

export const userInclude = {
  manager: { select: { id: true, name: true } },
  zone: { select: { id: true, name: true } },
  managedTeam: { select: { id: true, name: true } },
  _count: { select: { reports: true } },
};

export function publicUser(u) {
  if (!u) return null;
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...rest } = u;
  return rest;
}

// ---------- DL photo upload ----------
const dlDir = path.resolve(config.uploadDir, 'dl');
fs.mkdirSync(dlDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: dlDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? cb(null, true) : cb(new HttpError(400, 'Only JPG, PNG or WebP images are allowed')),
});
const removeFile = (url) => {
  if (!url?.startsWith('/uploads/')) return;
  fs.promises.unlink(path.resolve(config.uploadDir, url.replace('/uploads/', ''))).catch(() => {});
};

// ---------- schemas ----------
const optStr = z.string().trim().max(200).optional().nullable().transform((v) => (v === '' ? null : v));
const optId = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
const baseUser = {
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  role: z.enum(['ADMIN', 'MANAGER', 'FIELD_VISITOR']).default('FIELD_VISITOR'),
  phone: optStr,
  employeeCode: optStr,
  state: optStr,
  district: optStr,
  bikeName: optStr,
  bikeMileage: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).max(500).nullable()).optional(),
  dlNumber: optStr,
  managerId: optId,
  zoneId: optId,
  isActive: z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]).optional(),
};
const createSchema = z.object({ ...baseUser, password: z.string().min(8, 'Password must be at least 8 characters').max(128) });
const updateSchema = z.object({ ...baseUser, password: z.string().min(8).max(128).optional().or(z.literal('')) }).partial();

/** Normalise role-dependent fields and enforce manager permissions */
async function prepare(req, data, existing) {
  const me = req.user;
  if (me.role === 'MANAGER') {
    // Managers can only create/edit their own field employees
    data.role = 'FIELD_VISITOR';
    data.managerId = me.id;
    delete data.isActive;
  }
  const role = data.role ?? existing?.role;
  if (role !== 'FIELD_VISITOR') {
    data.managerId = null;
  } else if (data.managerId) {
    const mgr = await prisma.user.findUnique({ where: { id: data.managerId }, select: { role: true } });
    if (mgr?.role !== 'MANAGER') throw new HttpError(400, 'Reporting manager must be a user with the Manager role');
  }
  return data;
}

async function assertCanManage(req, user) {
  if (!user) throw new HttpError(404, 'Employee not found');
  if (req.user.role === 'MANAGER' && user.managerId !== req.user.id) throw new HttpError(404, 'Employee not found');
}

// ---------- routes ----------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pg = paginate(req.query);
    const { q, role, status, managerId, zoneId } = req.query;
    const isMgr = req.user.role === 'MANAGER';
    const where = {
      ...(isMgr ? { managerId: req.user.id } : managerId && { managerId: managerId === 'none' ? null : managerId }),
      ...(role && { role }),
      ...(zoneId && { zoneId }),
      ...(status === 'active' && { isActive: true }),
      ...(status === 'inactive' && { isActive: false }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { employeeCode: { contains: q, mode: 'insensitive' } },
          { district: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, rows, byRole] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, include: userInclude, orderBy: [{ role: 'asc' }, { name: 'asc' }], skip: pg.skip, take: pg.take }),
      prisma.user.groupBy({ by: ['role'], where: isMgr ? { managerId: req.user.id } : {}, _count: true }),
    ]);
    res.json({ data: rows.map(publicUser), meta: pageMeta(total, pg), roleCounts: Object.fromEntries(byRole.map((r) => [r.role, r._count])) });
  }),
);

/** Lightweight list for dropdowns. ?role=MANAGER for managers, default field employees (scoped). */
router.get(
  '/options',
  asyncHandler(async (req, res) => {
    const role = ['ADMIN', 'MANAGER', 'FIELD_VISITOR'].includes(req.query.role) ? req.query.role : 'FIELD_VISITOR';
    const where = { role };
    if (req.user.role === 'MANAGER') {
      if (role !== 'FIELD_VISITOR') return res.json({ data: [] });
      where.managerId = req.user.id;
    } else if (req.query.managerId) where.managerId = req.query.managerId;
    const rows = await prisma.user.findMany({
      where,
      select: { id: true, name: true, isActive: true, managerId: true, zone: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ data: rows });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: userInclude });
    await assertCanManage(req, user);
    const [byStatus, distance, revenue, visits, shifts] = await Promise.all([
      prisma.visit.groupBy({ by: ['status'], where: { userId: user.id }, _count: true }),
      prisma.shift.aggregate({ where: { userId: user.id }, _sum: { distanceKm: true, allowance: true }, _count: true }),
      prisma.visit.aggregate({ where: { userId: user.id, status: 'DEAL_DONE' }, _sum: { dealValue: true } }),
      prisma.visit.findMany({ where: { userId: user.id }, orderBy: { visitedAt: 'desc' }, take: 25 }),
      prisma.shift.findMany({ where: { userId: user.id }, orderBy: { date: 'desc' }, take: 10, include: { _count: { select: { visits: true } } } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
    res.json({
      user: publicUser(user),
      stats: {
        ...counts,
        totalVisits: byStatus.reduce((a, s) => a + s._count, 0),
        totalKm: distance._sum.distanceKm || 0,
        allowance: Number(distance._sum.allowance || 0),
        revenue: Number(revenue._sum.dealValue || 0),
        shifts: distance._count,
      },
      recentVisits: visits,
      recentShifts: shifts,
    });
  }),
);

router.post(
  '/',
  upload.single('dlPhoto'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { password, ...rest } = req.body;
    const data = await prepare(req, rest);
    try {
      const user = await prisma.user.create({
        data: { ...data, passwordHash: await bcrypt.hash(password, 10), dlPhotoUrl: req.file ? `/uploads/dl/${req.file.filename}` : null },
        include: userInclude,
      });
      res.status(201).json({ user: publicUser(user) });
    } catch (e) {
      if (req.file) removeFile(`/uploads/dl/${req.file.filename}`);
      throw e;
    }
  }),
);

router.patch(
  '/:id',
  upload.single('dlPhoto'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    await assertCanManage(req, existing);
    const { password, ...rest } = req.body;
    Object.keys(rest).forEach((k) => rest[k] === undefined && delete rest[k]);
    if (req.user.role === 'ADMIN' && existing.id === req.user.id && (rest.isActive === false || (rest.role && rest.role !== 'ADMIN')))
      throw new HttpError(400, 'You cannot disable or demote your own account');
    const data = await prepare(req, rest, existing);
    if (data.managerId === existing.id) throw new HttpError(400, 'An employee cannot report to themselves');
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    if (req.file) data.dlPhotoUrl = `/uploads/dl/${req.file.filename}`;
    if (req.query.removeDl === 'true' && !req.file) data.dlPhotoUrl = null;

    const user = await prisma.$transaction(async (tx) => {
      // A manager demoted from MANAGER releases their team and reports
      if (existing.role === 'MANAGER' && data.role && data.role !== 'MANAGER') {
        await tx.user.updateMany({ where: { managerId: existing.id }, data: { managerId: null } });
        await tx.team.updateMany({ where: { managerId: existing.id }, data: { managerId: null } });
      }
      return tx.user.update({ where: { id: existing.id }, data, include: userInclude });
    });
    if ((req.file || data.dlPhotoUrl === null) && existing.dlPhotoUrl) removeFile(existing.dlPhotoUrl);
    res.json({ user: publicUser(user) });
  }),
);

/** Bifurcation: move several employees under a manager / zone in one go (admin) */
router.post(
  '/reassign',
  requireRole('ADMIN'),
  validate(z.object({ userIds: z.array(z.string()).min(1), managerId: optId, zoneId: optId.optional() })),
  asyncHandler(async (req, res) => {
    const { userIds, managerId, zoneId } = req.body;
    if (managerId) {
      const mgr = await prisma.user.findUnique({ where: { id: managerId }, select: { role: true } });
      if (mgr?.role !== 'MANAGER') throw new HttpError(400, 'Select a valid manager');
    }
    const r = await prisma.user.updateMany({
      where: { id: { in: userIds }, role: 'FIELD_VISITOR' },
      data: { managerId, ...(zoneId !== undefined && { zoneId }) },
    });
    res.json({ ok: true, updated: r.count });
  }),
);

router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new HttpError(404, 'Employee not found');
    const [visits, reports] = await Promise.all([
      prisma.visit.count({ where: { userId: target.id } }),
      prisma.user.count({ where: { managerId: target.id } }),
    ]);
    if (visits > 0 || reports > 0) {
      // Preserve history and team structure: deactivate instead of deleting
      await prisma.user.update({ where: { id: target.id }, data: { isActive: false } });
      return res.json({ ok: true, deactivated: true });
    }
    await prisma.user.delete({ where: { id: target.id } });
    removeFile(target.dlPhotoUrl);
    res.json({ ok: true });
  }),
);

export default router;
