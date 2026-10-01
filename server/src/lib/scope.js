import { prisma } from './prisma.js';

/** Ids of field employees reporting to a manager */
export async function teamIds(managerId) {
  const rows = await prisma.user.findMany({ where: { managerId, role: 'FIELD_VISITOR' }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * User ids the requester may see.
 *  - FIELD_VISITOR → only themselves
 *  - MANAGER       → employees reporting to them
 *  - ADMIN         → everyone (null), or one manager's team when ?managerId= is passed
 */
export async function scopeIds(req) {
  const u = req.user;
  if (u.role === 'FIELD_VISITOR') return [u.id];
  if (u.role === 'MANAGER') return teamIds(u.id);
  if (req.query.managerId) return teamIds(String(req.query.managerId));
  return null;
}

/** Prisma where-fragment for a userId column, honouring ?userId= inside the allowed scope */
export async function scopedUserWhere(req, field = 'userId') {
  const ids = await scopeIds(req);
  const wanted = req.query.userId ? String(req.query.userId) : null;
  if (wanted) return { [field]: !ids || ids.includes(wanted) ? wanted : '__none__' };
  return ids ? { [field]: { in: ids } } : {};
}

/** Can the requester see/act on records belonging to `userId`? */
export async function canAccessUser(req, userId) {
  const u = req.user;
  if (u.role === 'ADMIN') return true;
  if (u.role === 'FIELD_VISITOR') return u.id === userId;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { managerId: true } });
  return target?.managerId === u.id;
}
