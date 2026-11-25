import { prisma } from "./prisma.js";
import { config } from "./config.js";
import { HttpError } from "./http.js";
import { localDate, isDateStr, addDays, monthBounds } from "./date.js";
import { scopeIds } from "./scope.js";

/**
 * Attendance & working-hours report.
 *  - Login  = shift punch-in  (Shift.startTime)
 *  - Logout = shift punch-out (Shift.endTime)
 *  - Working hours = logout − login; a 9 hr day includes a 1 hr break (both configurable in Settings)
 */

export const WORK_RULE_DEFAULTS = {
  /** Normal login time, HH:MM (24h) */
  workStartTime: "09:00",
  /** Required time on duty per day, including the break */
  workHoursPerDay: 9,
  /** Break included in the working day */
  breakMinutes: 60,
  /** Minutes after the login time before a login counts as late */
  lateGraceMinutes: 15,
  /** Weekly off days as JS weekday numbers (0 = Sunday … 6 = Saturday) */
  weeklyOff: [0],
};

const RULE_KEYS = {
  workStartTime: "work.startTime",
  workHoursPerDay: "work.hoursPerDay",
  breakMinutes: "work.breakMinutes",
  lateGraceMinutes: "work.lateGraceMinutes",
  weeklyOff: "work.weeklyOff",
};

export async function getWorkRules() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(RULE_KEYS) } },
  });
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const num = (key, def) => {
    const n = Number(v[key]);
    return v[key] != null && Number.isFinite(n) ? n : def;
  };
  const d = WORK_RULE_DEFAULTS;
  return {
    workStartTime: /^\d{2}:\d{2}$/.test(v[RULE_KEYS.workStartTime] || "")
      ? v[RULE_KEYS.workStartTime]
      : d.workStartTime,
    workHoursPerDay: num(RULE_KEYS.workHoursPerDay, d.workHoursPerDay),
    breakMinutes: num(RULE_KEYS.breakMinutes, d.breakMinutes),
    lateGraceMinutes: num(RULE_KEYS.lateGraceMinutes, d.lateGraceMinutes),
    weeklyOff:
      v[RULE_KEYS.weeklyOff] != null
        ? v[RULE_KEYS.weeklyOff]
            .split(",")
            .filter((s) => s !== "")
            .map(Number)
            .filter((n) => n >= 0 && n <= 6)
        : d.weeklyOff,
  };
}

export async function saveWorkRules(input) {
  for (const [field, key] of Object.entries(RULE_KEYS)) {
    if (input[field] === undefined) continue;
    const value = Array.isArray(input[field])
      ? input[field].join(",")
      : String(input[field]);
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  return getWorkRules();
}

/** Derived timings from the rules, in minutes */
export function ruleMinutes(rules) {
  const [h, m] = rules.workStartTime.split(":").map(Number);
  const startMin = h * 60 + m;
  const requiredMin = Math.round(rules.workHoursPerDay * 60);
  return {
    startMin,
    requiredMin,
    breakMin: rules.breakMinutes,
    netRequiredMin: Math.max(0, requiredMin - rules.breakMinutes),
    expectedEndMin: startMin + requiredMin,
    lateAfterMin: startMin + rules.lateGraceMinutes,
  };
}

/** Minutes since local midnight (APP_TIMEZONE) */
const tzParts = new Intl.DateTimeFormat("en-US", {
  timeZone: config.timezone,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});
export function localMinutes(d) {
  const p = Object.fromEntries(
    tzParts.formatToParts(new Date(d)).map((x) => [x.type, x.value]),
  );
  return Number(p.hour) * 60 + Number(p.minute);
}

/** 125 → "2:05" */
export const hhmm = (mins) => {
  if (mins == null) return "";
  const sign = mins < 0 ? "-" : "";
  const a = Math.abs(Math.round(mins));
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};
/** 540 → "09:00 AM" */
export const clock = (mins) => {
  if (mins == null) return "";
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekday = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

/** Work out one day for one employee */
export function evaluateDay({
  date,
  shift,
  visits = 0,
  deals = 0,
  rules,
  today,
  now = new Date(),
}) {
  const r = ruleMinutes(rules);
  const row = {
    date,
    day: WEEKDAYS[weekday(date)],
    status: "",
    loginAt: null,
    logoutAt: null,
    loginMin: null,
    logoutMin: null,
    lateMinutes: 0,
    dutyMinutes: null,
    breakMinutes: null,
    netMinutes: null,
    shortMinutes: 0,
    overtimeMinutes: 0,
    startKm: null,
    endKm: null,
    distanceKm: null,
    allowance: null,
    visits,
    deals,
    alerts: [],
    shiftId: null,
  };

  if (!shift) {
    if (rules.weeklyOff.includes(weekday(date))) row.status = "Weekly off";
    else if (date === today) {
      // Day still running – flag only once the late-login cut-off has passed
      row.status = "Not logged in";
      if (localMinutes(now) > r.lateAfterMin) row.alerts.push("Not logged in");
    } else {
      row.status = "Absent";
      row.alerts.push("Absent");
    }
    return row;
  }

  row.shiftId = shift.id;
  row.loginAt = shift.startTime;
  row.loginMin = localMinutes(shift.startTime);
  row.startKm = shift.startKm;
  row.lateMinutes = Math.max(0, row.loginMin - r.startMin);
  if (row.loginMin > r.lateAfterMin) row.alerts.push("Late login");

  if (shift.status === "ACTIVE") {
    if (date === today) {
      row.status = "On field";
      // Running total so far (not final)
      row.dutyMinutes = Math.max(
        0,
        Math.round((now - new Date(shift.startTime)) / 60000),
      );
    } else {
      row.status = "Not logged out";
      row.alerts.push("Not logged out");
    }
  } else {
    row.status = "Present";
    row.logoutAt = shift.endTime;
    row.logoutMin = localMinutes(shift.endTime);
    row.endKm = shift.endKm;
    row.distanceKm = shift.distanceKm;
    row.allowance = shift.allowance != null ? Number(shift.allowance) : null;
    row.dutyMinutes = Math.max(
      0,
      Math.round((new Date(shift.endTime) - new Date(shift.startTime)) / 60000),
    );
    row.shortMinutes = Math.max(0, r.requiredMin - row.dutyMinutes);
    row.overtimeMinutes = Math.max(0, row.dutyMinutes - r.requiredMin);
    if (row.shortMinutes > 0) row.alerts.push("Short hours");
    // Logged out before the expected end time (e.g. 6:00 PM), on the same day
    if (
      localDate(new Date(shift.endTime)) === date &&
      row.logoutMin < r.expectedEndMin
    )
      row.alerts.push("Early logout");
  }

  if (row.dutyMinutes != null) {
    row.breakMinutes = Math.min(r.breakMin, row.dutyMinutes);
    row.netMinutes = row.dutyMinutes - row.breakMinutes;
  }
  if (row.status !== "On field" && !visits) row.alerts.push("No visits");
  return row;
}

const MAX_DAYS = 93;

/**
 * Build the day-wise attendance report for field employees in the requester's scope.
 * Query: from, to (YYYY-MM-DD), managerId (admin), userId
 */
export async function buildAttendanceReport(req) {
  const today = localDate();
  let from = isDateStr(req.query.from)
    ? req.query.from
    : monthBounds(today).from;
  let to = isDateStr(req.query.to) ? req.query.to : today;
  if (to > today) to = today; // future days have no attendance yet
  if (from > to) from = to;
  const days = [];
  for (let d = from; d <= to && days.length <= MAX_DAYS; d = addDays(d, 1))
    days.push(d);
  if (days.length > MAX_DAYS)
    throw new HttpError(
      400,
      `Choose a period of at most ${MAX_DAYS} days for the attendance report`,
    );

  const rules = await getWorkRules();
  const ids = await scopeIds(req);
  const wanted = req.query.userId ? String(req.query.userId) : null;
  const users = await prisma.user.findMany({
    where: {
      role: "FIELD_VISITOR",
      ...(ids && { id: { in: ids } }),
      ...(wanted && { id: wanted }),
    },
    select: {
      id: true,
      name: true,
      employeeCode: true,
      district: true,
      isActive: true,
      createdAt: true,
      manager: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const userIds = users.map((u) => u.id);

  const [shifts, visitCounts] = await Promise.all([
    prisma.shift.findMany({
      where: { userId: { in: userIds }, date: { gte: from, lte: to } },
    }),
    prisma.visit.groupBy({
      by: ["shiftId", "status"],
      where: {
        userId: { in: userIds },
        shift: { date: { gte: from, lte: to } },
      },
      _count: true,
    }),
  ]);
  const shiftMap = new Map(shifts.map((s) => [`${s.userId}|${s.date}`, s]));
  const vMap = new Map();
  for (const g of visitCounts) {
    const e = vMap.get(g.shiftId) || { visits: 0, deals: 0 };
    e.visits += g._count;
    if (g.status === "DEAL_DONE") e.deals += g._count;
    vMap.set(g.shiftId, e);
  }

  const now = new Date();
  const rows = [];
  const summary = [];
  for (const u of users) {
    const joined = localDate(u.createdAt);
    const s = {
      user: {
        id: u.id,
        name: u.name,
        employeeCode: u.employeeCode,
        manager: u.manager?.name || null,
        district: u.district,
        isActive: u.isActive,
      },
      workingDays: 0,
      present: 0,
      absent: 0,
      weeklyOff: 0,
      lateDays: 0,
      shortDays: 0,
      earlyLogouts: 0,
      notLoggedOut: 0,
      dutyMinutes: 0,
      netMinutes: 0,
      overtimeMinutes: 0,
      shortMinutes: 0,
      distanceKm: 0,
      allowance: 0,
      visits: 0,
      deals: 0,
      loginMinSum: 0,
      completedDays: 0,
      alerts: 0,
    };
    for (const date of days) {
      const shift = shiftMap.get(`${u.id}|${date}`);
      // Skip days before the employee joined, and days an inactive employee has no record
      if (!shift && (date < joined || !u.isActive)) continue;
      const v = shift
        ? vMap.get(shift.id) || { visits: 0, deals: 0 }
        : { visits: 0, deals: 0 };
      const row = evaluateDay({
        date,
        shift,
        visits: v.visits,
        deals: v.deals,
        rules,
        today,
        now,
      });
      row.user = s.user;
      rows.push(row);

      if (row.status === "Weekly off") s.weeklyOff++;
      else s.workingDays++;
      if (row.status === "Absent") s.absent++;
      if (shift) {
        s.present++;
        s.loginMinSum += row.loginMin;
      }
      if (row.alerts.includes("Late login")) s.lateDays++;
      if (row.alerts.includes("Short hours")) s.shortDays++;
      if (row.alerts.includes("Early logout")) s.earlyLogouts++;
      if (row.alerts.includes("Not logged out")) s.notLoggedOut++;
      if (row.status === "Present") {
        s.completedDays++;
        s.dutyMinutes += row.dutyMinutes;
        s.netMinutes += row.netMinutes;
        s.overtimeMinutes += row.overtimeMinutes;
        s.shortMinutes += row.shortMinutes;
      }
      s.distanceKm += row.distanceKm || 0;
      s.allowance += row.allowance || 0;
      s.visits += row.visits;
      s.deals += row.deals;
      s.alerts += row.alerts.length;
    }
    s.distanceKm = Math.round(s.distanceKm * 10) / 10;
    s.allowance = Math.round(s.allowance * 100) / 100;
    s.avgLoginMin = s.present ? Math.round(s.loginMinSum / s.present) : null;
    s.avgDutyMinutes = s.completedDays
      ? Math.round(s.dutyMinutes / s.completedDays)
      : null;
    s.attendancePct = s.workingDays
      ? Math.round((s.present / s.workingDays) * 100)
      : null;
    delete s.loginMinSum;
    summary.push(s);
  }

  // Newest day first, then by name
  rows.sort((a, b) =>
    a.date === b.date
      ? a.user.name.localeCompare(b.user.name)
      : a.date < b.date
        ? 1
        : -1,
  );

  const count = (name) => rows.filter((r) => r.alerts.includes(name)).length;
  const totals = {
    employees: users.length,
    present: rows.filter((r) => r.shiftId).length,
    absent: count("Absent"),
    late: count("Late login"),
    shortHours: count("Short hours"),
    earlyLogout: count("Early logout"),
    notLoggedOut: count("Not logged out"),
    notLoggedIn: count("Not logged in"),
    noVisits: count("No visits"),
    distanceKm:
      Math.round(summary.reduce((a, s) => a + s.distanceKm, 0) * 10) / 10,
    visits: summary.reduce((a, s) => a + s.visits, 0),
    dutyMinutes: summary.reduce((a, s) => a + s.dutyMinutes, 0),
  };

  return {
    from,
    to,
    today,
    rules,
    ruleMinutes: ruleMinutes(rules),
    rows,
    summary,
    totals,
  };
}
