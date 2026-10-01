import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/http.js';
import { requireRole } from '../middleware/auth.js';
import { localDate, dateRange, dateStrRange, monthBounds, startOfLocalDay, addDays } from '../lib/date.js';

const router = Router();

/** Field visitor home summary */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const uid = req.user.id;
    const today = localDate();
    const todayRange = dateRange(today, today);
    const month = monthBounds(today);
    const [todayVisits, monthDeals, followUpsDue, monthVisits, monthKm, byStatus] = await Promise.all([
      prisma.visit.count({ where: { userId: uid, visitedAt: todayRange } }),
      prisma.visit.count({ where: { userId: uid, status: 'DEAL_DONE', visitedAt: dateRange(month.from, month.to) } }),
      prisma.visit.count({ where: { userId: uid, status: 'FOLLOW_UP', nextFollowUp: { lt: startOfLocalDay(addDays(today, 1)) } } }),
      prisma.visit.count({ where: { userId: uid, visitedAt: dateRange(month.from, month.to) } }),
      prisma.shift.aggregate({ where: { userId: uid, date: dateStrRange(month.from, month.to) }, _sum: { distanceKm: true, allowance: true } }),
      prisma.visit.groupBy({ by: ['status'], where: { userId: uid }, _count: true }),
    ]);
    const me = await prisma.user.findUnique({
      where: { id: uid },
      select: { team: { select: { name: true, visitsTarget: true, dealsTarget: true } } },
    });
    res.json({
      today,
      todayVisits,
      monthDeals,
      monthVisits,
      followUpsDue,
      monthKm: monthKm._sum.distanceKm || 0,
      monthAllowance: Number(monthKm._sum.allowance || 0),
      statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      team: me?.team || null,
    });
  }),
);

/** Admin dashboard */
router.get(
  '/admin',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const today = localDate();
    const from = req.query.from || monthBounds(today).from;
    const to = req.query.to || today;
    const vRange = dateRange(from, to);
    const sRange = dateStrRange(from, to);

    const [activeReps, todayShifts, byStatus, fleet, revenue, perRepVisits, perRepDeals, perRepKm, reps, teams, recent] = await Promise.all([
      prisma.user.count({ where: { role: 'FIELD_VISITOR', isActive: true } }),
      prisma.shift.groupBy({ by: ['status'], where: { date: today }, _count: true }),
      prisma.visit.groupBy({ by: ['status'], where: { visitedAt: vRange }, _count: true }),
      prisma.shift.aggregate({ where: { date: sRange }, _sum: { distanceKm: true, allowance: true } }),
      prisma.visit.aggregate({ where: { visitedAt: vRange, status: 'DEAL_DONE' }, _sum: { dealValue: true } }),
      prisma.visit.groupBy({ by: ['userId'], where: { visitedAt: vRange }, _count: true }),
      prisma.visit.groupBy({ by: ['userId', 'status'], where: { visitedAt: vRange }, _count: true }),
      prisma.shift.groupBy({ by: ['userId'], where: { date: sRange }, _sum: { distanceKm: true } }),
      prisma.user.findMany({
        where: { role: 'FIELD_VISITOR' },
        select: { id: true, name: true, isActive: true, district: true, team: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.team.findMany({ include: { members: { select: { id: true } }, zone: { select: { name: true } } }, orderBy: { name: 'asc' } }),
      prisma.visit.findMany({ where: { visitedAt: vRange }, include: { user: { select: { name: true } } }, orderBy: { visitedAt: 'desc' }, take: 8 }),
    ]);

    const shiftCounts = Object.fromEntries(todayShifts.map((s) => [s.status, s._count]));
    const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
    const visitsBy = Object.fromEntries(perRepVisits.map((r) => [r.userId, r._count]));
    const kmBy = Object.fromEntries(perRepKm.map((r) => [r.userId, r._sum.distanceKm || 0]));
    const statusBy = {};
    for (const r of perRepDeals) (statusBy[r.userId] ||= {})[r.status] = r._count;

    const repStats = reps.map((r) => {
      const s = statusBy[r.id] || {};
      const visits = visitsBy[r.id] || 0;
      return {
        ...r,
        team: r.team?.name || null,
        visits,
        deals: s.DEAL_DONE || 0,
        followUps: s.FOLLOW_UP || 0,
        open: s.OPEN || 0,
        leaveOut: s.LEAVE_OUT || 0,
        km: Math.round((kmBy[r.id] || 0) * 10) / 10,
        conversion: visits ? Math.round(((s.DEAL_DONE || 0) / visits) * 100) : 0,
      };
    });

    const teamStats = await Promise.all(
      teams.map(async (t) => {
        const ids = t.members.map((m) => m.id);
        const [v, d, rev] = ids.length
          ? await Promise.all([
              prisma.visit.count({ where: { userId: { in: ids }, visitedAt: vRange } }),
              prisma.visit.count({ where: { userId: { in: ids }, visitedAt: vRange, status: 'DEAL_DONE' } }),
              prisma.visit.aggregate({ where: { userId: { in: ids }, visitedAt: vRange, status: 'DEAL_DONE' }, _sum: { dealValue: true } }),
            ])
          : [0, 0, { _sum: { dealValue: 0 } }];
        return {
          id: t.id,
          name: t.name,
          zone: t.zone?.name || null,
          members: ids.length,
          visits: v,
          deals: d,
          revenue: Number(rev._sum.dealValue || 0),
          visitsTarget: t.visitsTarget,
          dealsTarget: t.dealsTarget,
          revenueTarget: Number(t.revenueTarget),
        };
      }),
    );

    const totalVisits = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    res.json({
      range: { from, to, today },
      attendance: {
        activeReps,
        onField: shiftCounts.ACTIVE || 0,
        completed: shiftCounts.COMPLETED || 0,
        loggedIn: (shiftCounts.ACTIVE || 0) + (shiftCounts.COMPLETED || 0),
        pending: Math.max(0, activeReps - (shiftCounts.ACTIVE || 0) - (shiftCounts.COMPLETED || 0)),
      },
      pipeline: { ...statusCounts, total: totalVisits },
      fleet: { distanceKm: Math.round((fleet._sum.distanceKm || 0) * 10) / 10, allowance: Number(fleet._sum.allowance || 0) },
      revenue: Number(revenue._sum.dealValue || 0),
      conversion: totalVisits ? Math.round(((statusCounts.DEAL_DONE || 0) / totalVisits) * 100) : 0,
      repStats,
      teamStats,
      recent,
    });
  }),
);

/** Live positions of reps with active shifts today */
router.get(
  '/live',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const today = localDate();
    const shifts = await prisma.shift.findMany({
      where: { OR: [{ status: 'ACTIVE' }, { date: today }] },
      include: { user: { select: { id: true, name: true, phone: true, bikeName: true } }, _count: { select: { visits: true } } },
    });
    const ids = shifts.map((s) => s.id);
    // DISTINCT ON uses the (shiftId, recordedAt) index – one row per shift, no in-memory scan
    const latest = ids.length
      ? await prisma.$queryRaw`
          SELECT DISTINCT ON ("shiftId") "shiftId", "lat", "lng", "recordedAt"
          FROM "LocationPing"
          WHERE "shiftId" = ANY(${ids})
          ORDER BY "shiftId", "recordedAt" DESC`
      : [];
    const byShift = Object.fromEntries(latest.map((p) => [p.shiftId, p]));
    res.json({
      data: shifts.map((s) => ({
        shiftId: s.id,
        status: s.status,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        startKm: s.startKm,
        user: s.user,
        visits: s._count.visits,
        last: byShift[s.id] || (s.startLat != null ? { lat: s.startLat, lng: s.startLng, recordedAt: s.startTime } : null),
      })),
    });
  }),
);

export default router;
