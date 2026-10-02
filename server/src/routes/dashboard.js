import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import {
  localDate,
  dateRange,
  dateStrRange,
  monthBounds,
  startOfLocalDay,
  addDays,
  isDateStr,
} from "../lib/date.js";

const router = Router();

/** Field employee home summary */
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const uid = req.user.id;
    const today = localDate();
    const month = monthBounds(today);
    const mRange = dateRange(month.from, month.to);
    const [
      todayVisits,
      monthDeals,
      followUpsDue,
      monthVisits,
      monthKm,
      monthRevenue,
      me,
    ] = await Promise.all([
      prisma.visit.count({
        where: { userId: uid, visitedAt: dateRange(today, today) },
      }),
      prisma.visit.count({
        where: { userId: uid, status: "DEAL_DONE", visitedAt: mRange },
      }),
      prisma.visit.count({
        where: {
          userId: uid,
          status: "FOLLOW_UP",
          nextFollowUp: { lt: startOfLocalDay(addDays(today, 1)) },
        },
      }),
      prisma.visit.count({ where: { userId: uid, visitedAt: mRange } }),
      prisma.shift.aggregate({
        where: { userId: uid, date: dateStrRange(month.from, month.to) },
        _sum: { distanceKm: true, allowance: true },
      }),
      prisma.visit.aggregate({
        where: { userId: uid, status: "DEAL_DONE", visitedAt: mRange },
        _sum: { dealValue: true },
      }),
      prisma.user.findUnique({
        where: { id: uid },
        select: {
          manager: {
            select: {
              name: true,
              phone: true,
              _count: { select: { reports: true } },
              managedTeam: {
                select: { name: true, visitsTarget: true, dealsTarget: true },
              },
            },
          },
        },
      }),
    ]);
    const team = me?.manager?.managedTeam;
    const size = Math.max(1, me?.manager?._count?.reports || 1);
    res.json({
      today,
      todayVisits,
      monthDeals,
      monthVisits,
      followUpsDue,
      monthKm: monthKm._sum.distanceKm || 0,
      monthAllowance: Number(monthKm._sum.allowance || 0),
      monthRevenue: Number(monthRevenue._sum.dealValue || 0),
      manager: me?.manager
        ? { name: me.manager.name, phone: me.manager.phone }
        : null,
      // Personal share of the team target
      target: team
        ? {
            team: team.name,
            visits: Math.ceil(team.visitsTarget / size),
            deals: Math.ceil(team.dealsTarget / size),
          }
        : null,
    });
  }),
);

/**
 * One-shot payload for the Admin / Manager command center.
 * Query: from, to (period), date (attendance day, default today), managerId (admin only)
 */
router.get(
  "/overview",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const today = localDate();
    const isMgr = req.user.role === "MANAGER";
    const from = isDateStr(req.query.from)
      ? req.query.from
      : monthBounds(today).from;
    const to = isDateStr(req.query.to) ? req.query.to : today;
    const day = isDateStr(req.query.date) ? req.query.date : today;
    const managerFilter = isMgr ? req.user.id : req.query.managerId || null;

    const reps = await prisma.user.findMany({
      where: {
        role: "FIELD_VISITOR",
        ...(managerFilter && { managerId: managerFilter }),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        isActive: true,
        district: true,
        bikeName: true,
        managerId: true,
        manager: { select: { name: true } },
        zone: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });
    const ids = reps.map((r) => r.id);
    // Leads owned by managers themselves (self-uploaded clients) count towards team totals
    const mgrs = await prisma.user.findMany({
      where: { role: "MANAGER", ...(managerFilter && { id: managerFilter }) },
      select: { id: true },
    });
    const mgrIds = mgrs.map((m) => m.id);
    const inScope = { userId: { in: ids } };
    const ownerScope = { userId: { in: [...ids, ...mgrIds] } };
    const vRange = dateRange(from, to);
    const sRange = dateStrRange(from, to);

    const [
      byRepStatus,
      revByRep,
      kmByRep,
      dayShifts,
      dayVisits,
      followUpsDue,
      teams,
      paymentsDue,
      mgrStatus,
      mgrRev,
    ] = await Promise.all([
      prisma.visit.groupBy({
        by: ["userId", "status"],
        where: { ...inScope, visitedAt: vRange },
        _count: true,
      }),
      prisma.visit.groupBy({
        by: ["userId"],
        where: { ...inScope, visitedAt: vRange, status: "DEAL_DONE" },
        _sum: { dealValue: true },
      }),
      prisma.shift.groupBy({
        by: ["userId"],
        where: { ...inScope, date: sRange },
        _sum: { distanceKm: true, allowance: true },
      }),
      prisma.shift.findMany({ where: { ...inScope, date: day } }),
      prisma.visit.groupBy({
        by: ["userId"],
        where: { ...inScope, visitedAt: dateRange(day, day) },
        _count: true,
      }),
      prisma.visit.count({
        where: {
          ...ownerScope,
          status: "FOLLOW_UP",
          nextFollowUp: { lt: startOfLocalDay(addDays(today, 1)) },
        },
      }),
      prisma.team.findMany({
        where: managerFilter ? { managerId: managerFilter } : {},
        include: {
          manager: { select: { id: true, name: true } },
          zone: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.visit.aggregate({
        where: {
          ...ownerScope,
          status: "DEAL_DONE",
          nextPaymentDate: { lt: startOfLocalDay(addDays(today, 8)) },
        },
        _count: true,
        _sum: { dealValue: true },
      }),
      mgrIds.length
        ? prisma.visit.groupBy({
            by: ["userId", "status"],
            where: { userId: { in: mgrIds }, visitedAt: vRange },
            _count: true,
          })
        : [],
      mgrIds.length
        ? prisma.visit.groupBy({
            by: ["userId"],
            where: {
              userId: { in: mgrIds },
              visitedAt: vRange,
              status: "DEAL_DONE",
            },
            _sum: { dealValue: true },
          })
        : [],
    ]);
    const mgrOwn = {};
    for (const r of mgrStatus) {
      const m = (mgrOwn[r.userId] ||= {
        visits: 0,
        deals: 0,
        revenue: 0,
        byStatus: {},
      });
      m.visits += r._count;
      m.byStatus[r.status] = r._count;
      if (r.status === "DEAL_DONE") m.deals += r._count;
    }
    for (const r of mgrRev)
      (mgrOwn[r.userId] ||= {
        visits: 0,
        deals: 0,
        revenue: 0,
        byStatus: {},
      }).revenue = Number(r._sum.dealValue || 0);
    const mgrSum = (f) => Object.values(mgrOwn).reduce((a, m) => a + f(m), 0);

    const statusBy = {};
    for (const r of byRepStatus)
      (statusBy[r.userId] ||= {})[r.status] = r._count;
    const revBy = Object.fromEntries(
      revByRep.map((r) => [r.userId, Number(r._sum.dealValue || 0)]),
    );
    const kmBy = Object.fromEntries(kmByRep.map((r) => [r.userId, r._sum]));
    const shiftBy = Object.fromEntries(dayShifts.map((s) => [s.userId, s]));
    const dayVisitsBy = Object.fromEntries(
      dayVisits.map((r) => [r.userId, r._count]),
    );

    const repStats = reps.map((r) => {
      const s = statusBy[r.id] || {};
      const visits =
        (s.OPEN || 0) +
        (s.FOLLOW_UP || 0) +
        (s.DEAL_DONE || 0) +
        (s.LEAVE_OUT || 0);
      const sh = shiftBy[r.id];
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        isActive: r.isActive,
        district: r.district,
        bikeName: r.bikeName,
        managerId: r.managerId,
        manager: r.manager?.name || null,
        zone: r.zone?.name || null,
        visits,
        deals: s.DEAL_DONE || 0,
        followUps: s.FOLLOW_UP || 0,
        open: s.OPEN || 0,
        leaveOut: s.LEAVE_OUT || 0,
        revenue: revBy[r.id] || 0,
        km: Math.round((kmBy[r.id]?.distanceKm || 0) * 10) / 10,
        allowance: Number(kmBy[r.id]?.allowance || 0),
        conversion: visits
          ? Math.round(((s.DEAL_DONE || 0) / visits) * 100)
          : 0,
        day: {
          status: sh ? sh.status : "NOT_STARTED",
          shiftId: sh?.id || null,
          startTime: sh?.startTime || null,
          endTime: sh?.endTime || null,
          startKm: sh?.startKm ?? null,
          endKm: sh?.endKm ?? null,
          km: sh?.distanceKm ?? null,
          visits: dayVisitsBy[r.id] || 0,
        },
      };
    });

    const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
    const active = repStats.filter((r) => r.isActive);
    const pipeline = {
      OPEN: sum(repStats, "open") + mgrSum((m) => m.byStatus.OPEN || 0),
      FOLLOW_UP:
        sum(repStats, "followUps") + mgrSum((m) => m.byStatus.FOLLOW_UP || 0),
      DEAL_DONE:
        sum(repStats, "deals") + mgrSum((m) => m.byStatus.DEAL_DONE || 0),
      LEAVE_OUT:
        sum(repStats, "leaveOut") + mgrSum((m) => m.byStatus.LEAVE_OUT || 0),
    };
    pipeline.total =
      pipeline.OPEN +
      pipeline.FOLLOW_UP +
      pipeline.DEAL_DONE +
      pipeline.LEAVE_OUT;

    // Team progress = sum of the manager's employees
    const teamStats = teams.map((t) => {
      const members = repStats.filter(
        (r) => t.managerId && r.managerId === t.managerId,
      );
      return {
        id: t.id,
        name: t.name,
        manager: t.manager,
        zone: t.zone?.name || null,
        members: members.length,
        visits: sum(members, "visits") + (mgrOwn[t.managerId]?.visits || 0),
        deals: sum(members, "deals") + (mgrOwn[t.managerId]?.deals || 0),
        revenue: sum(members, "revenue") + (mgrOwn[t.managerId]?.revenue || 0),
        managerOwn: mgrOwn[t.managerId]
          ? {
              visits: mgrOwn[t.managerId].visits,
              deals: mgrOwn[t.managerId].deals,
              revenue: mgrOwn[t.managerId].revenue,
            }
          : null,
        km: Math.round(sum(members, "km") * 10) / 10,
        visitsTarget: t.visitsTarget,
        dealsTarget: t.dealsTarget,
        revenueTarget: Number(t.revenueTarget),
      };
    });

    const onField = active.filter((r) => r.day.status === "ACTIVE").length;
    const completed = active.filter((r) => r.day.status === "COMPLETED").length;
    res.json({
      range: { from, to, day, today },
      attendance: {
        activeReps: active.length,
        loggedIn: onField + completed,
        onField,
        completed,
        pending: Math.max(0, active.length - onField - completed),
      },
      pipeline,
      revenue: sum(repStats, "revenue") + mgrSum((m) => m.revenue),
      managerLeads: {
        visits: mgrSum((m) => m.visits),
        deals: mgrSum((m) => m.deals),
        revenue: mgrSum((m) => m.revenue),
      },
      fleet: {
        distanceKm: Math.round(sum(repStats, "km") * 10) / 10,
        allowance: Math.round(sum(repStats, "allowance") * 100) / 100,
      },
      conversion: pipeline.total
        ? Math.round((pipeline.DEAL_DONE / pipeline.total) * 100)
        : 0,
      followUpsDue,
      paymentsDue: {
        count: paymentsDue._count,
        amount: Number(paymentsDue._sum.dealValue || 0),
      },
      repStats,
      teamStats,
    });
  }),
);

/** Live positions of employees with shifts today (scoped) */
router.get(
  "/live",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    const today = localDate();
    const managerFilter =
      req.user.role === "MANAGER" ? req.user.id : req.query.managerId || null;
    const shifts = await prisma.shift.findMany({
      where: {
        OR: [{ status: "ACTIVE" }, { date: today }],
        ...(managerFilter && { user: { managerId: managerFilter } }),
      },
      include: {
        user: { select: { id: true, name: true, phone: true, bikeName: true } },
        _count: { select: { visits: true } },
      },
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
        last:
          byShift[s.id] ||
          (s.startLat != null
            ? { lat: s.startLat, lng: s.startLng, recordedAt: s.startTime }
            : null),
      })),
    });
  }),
);

export default router;
