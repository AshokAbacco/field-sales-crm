import { prisma } from "./prisma.js";

/** Last odometer reading of a shift: highest of the punch-in reading and readings logged at visits */
export async function lastOdometerReading(shift) {
  if (!shift) return null;
  const agg = await prisma.visit.aggregate({
    where: { shiftId: shift.id, odometerKm: { not: null } },
    _max: { odometerKm: true },
  });
  return Math.max(shift.startKm, agg._max.odometerKm ?? 0);
}

/** Where the last reading came from – shown to the employee next to the "Bike KM" box */
export async function lastOdometerInfo(shift) {
  if (!shift) return null;
  const v = await prisma.visit.findFirst({
    where: { shiftId: shift.id, odometerKm: { not: null } },
    orderBy: [{ odometerKm: "desc" }, { visitedAt: "desc" }],
    select: { odometerKm: true, companyName: true, visitedAt: true },
  });
  if (v && v.odometerKm >= shift.startKm)
    return {
      km: v.odometerKm,
      source: "VISIT",
      name: v.companyName,
      at: v.visitedAt,
    };
  return {
    km: shift.startKm,
    source: "PUNCH_IN",
    name: null,
    at: shift.startTime,
  };
}
