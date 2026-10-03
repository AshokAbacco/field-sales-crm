import { prisma } from './prisma.js';

/**
 * Link visits to places by phone number (last 10 digits), so "visited / not visited" stays
 * correct even when an employee logs a visit without picking the place, or clients are imported.
 * Only visits without a place are touched. Pass exactly one of: placeIds, visitIds, since.
 */
export async function linkVisitsByPhone({ placeIds, visitIds, since } = {}) {
  const digits = (col) => `right(regexp_replace(${col}, '\\D', '', 'g'), 10)`;
  const base = `
    UPDATE "Visit" v SET "placeId" = p."id"
    FROM "Place" p
    WHERE v."placeId" IS NULL AND p."isActive" = true AND p."phone" IS NOT NULL
      AND length(regexp_replace(p."phone", '\\D', '', 'g')) >= 7
      AND ${digits('v."phone"')} = ${digits('p."phone"')}`;
  try {
    if (placeIds?.length) return await prisma.$executeRawUnsafe(`${base} AND p."id" = ANY($1::text[])`, placeIds);
    if (visitIds?.length) return await prisma.$executeRawUnsafe(`${base} AND v."id" = ANY($1::text[])`, visitIds);
    if (since) return await prisma.$executeRawUnsafe(`${base} AND v."createdAt" >= $1`, since);
  } catch (e) {
    console.error('[places] link by phone failed', e.message);
  }
  return 0;
}
