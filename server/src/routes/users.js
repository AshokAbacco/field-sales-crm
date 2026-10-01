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
router.use(requireRole('ADMIN'));

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
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new HttpError(400, 'Only JPG, PNG or WebP images are allowed')),
});

const removeFile = (url) => {
  if (!url?.startsWith('/uploads/')) return;
  const p = path.resolve(config.uploadDir, url.replace('/uploads/', ''));
  fs.promises.unlink(p).catch(() => {});
};

// ---------- schemas ----------
const optStr = z.string().trim().max(200).optional().nullable().transform((v) => (v === '' ? null : v));
const optId = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
const baseUser = {
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  role: z.enum(['ADMIN', 'FIELD_VISITOR']).default('FIELD_VISITOR'),
  phone: optStr,
  employeeCode: optStr,
  state: optStr,
  district: optStr,
  bikeName: optStr,
  bikeMileage: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).max(500).nullable()).optional(),
  dlNumber: optStr,
  teamId: optId,
  zoneId: optId,
  isActive: z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]).optional(),
};
const createSchema = z.object({ ...baseUser, password: z.string().min(8, 'Password must be at least 8 characters').max(128) });
const updateSchema = z.object({ ...baseUser, password: z.string().min(8).max(128).optional().or(z.literal('')) }).partial();

const include = { team: { select: { id: true, name: true } }, zone: { select: { id: true, name: true } } };

// ---------- routes ----------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pg = paginate(req.query);
    const { q, role, status, teamId } = req.query;
    const where = {
      ...(role && { role }),
      ...(teamId && { teamId }),
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
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: pg.skip, take: pg.take }),
    ]);
    res.json({ data: rows.map(publicUser), meta: pageMeta(total, pg) });
  }),
);

/** Lightweight list for dropdowns */
router.get(
  '/options',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.user.findMany({
      where: { role: 'FIELD_VISITOR' },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json({ data: rows });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, include });
    if (!user) throw new HttpError(404, 'Employee not found');
    const [byStatus, distance, visits] = await Promise.all([
      prisma.visit.groupBy({ by: ['status'], where: { userId: user.id }, _count: true }),
      prisma.shift.aggregate({ where: { userId: user.id }, _sum: { distanceKm: true }, _count: true }),
      prisma.visit.findMany({ where: { userId: user.id }, orderBy: { visitedAt: 'desc' }, take: 20 }),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
    res.json({
      user: publicUser(user),
      stats: { ...counts, totalVisits: byStatus.reduce((a, s) => a + s._count, 0), totalKm: distance._sum.distanceKm || 0, shifts: distance._count },
      recentVisits: visits,
    });
  }),
);

router.post(
  '/',
  upload.single('dlPhoto'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { password, ...data } = req.body;
    try {
      const user = await prisma.user.create({
        data: { ...data, passwordHash: await bcrypt.hash(password, 10), dlPhotoUrl: req.file ? `/uploads/dl/${req.file.filename}` : null },
        include,
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
    if (!existing) throw new HttpError(404, 'Employee not found');
    const { password, ...data } = req.body;
    if (existing.id === req.user.id && (data.isActive === false || (data.role && data.role !== 'ADMIN')))
      throw new HttpError(400, 'You cannot disable or demote your own account');
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    if (req.file) data.dlPhotoUrl = `/uploads/dl/${req.file.filename}`;
    if (req.query.removeDl === 'true' && !req.file) data.dlPhotoUrl = null;
    const user = await prisma.user.update({ where: { id: existing.id }, data, include });
    if ((req.file || data.dlPhotoUrl === null) && existing.dlPhotoUrl) removeFile(existing.dlPhotoUrl);
    res.json({ user: publicUser(user) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
    const visits = await prisma.visit.count({ where: { userId: req.params.id } });
    if (visits > 0 && req.query.force !== 'true') {
      // Preserve history: deactivate instead of deleting
      await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
      return res.json({ ok: true, deactivated: true, message: 'Employee has visit history and was deactivated instead of deleted' });
    }
    const user = await prisma.user.delete({ where: { id: req.params.id } });
    removeFile(user.dlPhotoUrl);
    res.json({ ok: true });
  }),
);

export default router;
