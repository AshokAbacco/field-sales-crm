import { prisma } from "./prisma.js";

/** Ids of field employees reporting to a manager */
export async function teamIds(managerId) {
  const rows = await prisma.user.findMany({
    where: { managerId, role: "FIELD_VISITOR" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * User ids the requester may see.
 *  - FIELD_VISITOR → only themselves
 *  - MANAGER       → themselves + employees reporting to them
 *  - ADMIN         → everyone (null), or one manager + their team when ?managerId= is passed
 */
export async function scopeIds(req) {
  const u = req.user;
  if (u.role === "FIELD_VISITOR") return [u.id];
  // Managers also own leads they uploaded / kept for themselves
  if (u.role === "MANAGER") return [u.id, ...(await teamIds(u.id))];
  if (req.query.managerId)
    return [
      String(req.query.managerId),
      ...(await teamIds(String(req.query.managerId))),
    ];
  return null;
}

/** Prisma where-fragment for a userId column, honouring ?userId= inside the allowed scope */
export async function scopedUserWhere(req, field = "userId") {
  const ids = await scopeIds(req);
  const wanted = req.query.userId ? String(req.query.userId) : null;
  if (wanted)
    return { [field]: !ids || ids.includes(wanted) ? wanted : "__none__" };
  return ids ? { [field]: { in: ids } } : {};
}

/** Can the requester see/act on records belonging to `userId`? */
export async function canAccessUser(req, userId) {
  const u = req.user;
  if (u.role === "ADMIN") return true;
  if (u.id === userId) return true;
  if (u.role === "FIELD_VISITOR") return false;
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { managerId: true },
  });
  return target?.managerId === u.id;
}

/** Users a lead can be assigned to by the requester (manager: self + team; admin: any active manager/employee) */
export async function canAssignTo(req, userId) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, managerId: true, isActive: true },
  });
  if (
    !target ||
    !target.isActive ||
    !["FIELD_VISITOR", "MANAGER"].includes(target.role)
  )
    return false;
  if (req.user.role === "ADMIN") return true;
  if (req.user.role === "MANAGER")
    return target.id === req.user.id || target.managerId === req.user.id;
  return target.id === req.user.id;
}
