import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { requireRole } from "../middleware/auth.js";
import { config } from "../lib/config.js";
import { localDate, dateStrRange } from "../lib/date.js";
import { buildVisitWhere } from "./visits.js";
import { scopedUserWhere } from "../lib/scope.js";
import { buildIncentiveReport } from "./incentives.js";
import { buildAttendanceReport, clock, hhmm } from "../lib/attendance.js";

const router = Router();
router.use(requireRole("ADMIN", "MANAGER"));

const BATCH = 1000;
const fmtDateTime = (d) =>
  d
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: config.timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(d))
    : "";
const fmtDate = (d) =>
  d
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: config.timezone,
        dateStyle: "medium",
      }).format(new Date(d))
    : "";
const human = (s) =>
  s
    ? String(s)
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

/** Each dataset: columns + async generator yielding row batches (cursor-based, memory-safe for large tables) */
const datasets = {
  visits: {
    title: "Field Visits",
    columns: [
      ["Visited At", 22],
      ["Owner", 22],
      ["Manager", 20],
      ["Source", 12],
      ["Business Name", 28],
      ["Category", 16],
      ["Product", 22],
      ["Contact Person", 20],
      ["Phone", 16],
      ["Email", 24],
      ["Status", 12],
      ["Plan", 20],
      ["Billing Cycle", 14],
      ["Plan Amount (INR)", 16],
      ["Deal Closed", 16],
      ["Next Payment", 16],
      ["Next Follow Up", 16],
      ["Address", 40],
      ["Latitude", 12],
      ["Longitude", 12],
      ["Odometer KM", 12],
      ["Notes", 40],
      ["Admin Note", 30],
    ],
    where: (req) => buildVisitWhere(req),
    async *rows(where) {
      let cursor;
      for (;;) {
        const batch = await prisma.visit.findMany({
          where,
          include: {
            user: {
              select: { name: true, manager: { select: { name: true } } },
            },
            category: { select: { name: true } },
          },
          orderBy: { id: "asc" },
          take: BATCH,
          ...(cursor && { skip: 1, cursor: { id: cursor } }),
        });
        if (!batch.length) return;
        yield batch.map((v) => [
          fmtDateTime(v.visitedAt),
          v.user?.name,
          v.user?.manager?.name,
          human(v.source),
          v.companyName,
          v.category?.name,
          v.product,
          v.contactPerson,
          v.phone,
          v.email,
          human(v.status),
          v.planName,
          human(v.billingCycle),
          v.dealValue != null ? Number(v.dealValue) : "",
          fmtDate(v.dealClosedAt),
          fmtDate(v.nextPaymentDate),
          fmtDate(v.nextFollowUp),
          v.address,
          v.lat,
          v.lng,
          v.odometerKm,
          v.notes,
          v.adminNote,
        ]);
        cursor = batch[batch.length - 1].id;
      }
    },
  },
  shifts: {
    title: "Travel & Reimbursement",
    columns: [
      ["Date", 12],
      ["Field Employee", 22],
      ["Manager", 20],
      ["District", 16],
      ["Bike", 18],
      ["Status", 12],
      ["Start Time", 20],
      ["Start KM", 12],
      ["Start Location", 30],
      ["End Time", 20],
      ["End KM", 12],
      ["End Location", 30],
      ["Working Hours (h:mm)", 14],
      ["Distance KM", 12],
      ["Rate / KM", 10],
      ["Allowance (INR)", 14],
      ["Visits", 8],
    ],
    where: async (req) => ({
      ...(await scopedUserWhere(req)),
      ...(dateStrRange(req.query.from, req.query.to) && {
        date: dateStrRange(req.query.from, req.query.to),
      }),
    }),
    async *rows(where) {
      let cursor;
      for (;;) {
        const batch = await prisma.shift.findMany({
          where,
          include: {
            user: {
              select: {
                name: true,
                district: true,
                bikeName: true,
                manager: { select: { name: true } },
              },
            },
            _count: { select: { visits: true } },
          },
          orderBy: { id: "asc" },
          take: BATCH,
          ...(cursor && { skip: 1, cursor: { id: cursor } }),
        });
        if (!batch.length) return;
        yield batch.map((s) => [
          s.date,
          s.user?.name,
          s.user?.manager?.name,
          s.user?.district,
          s.user?.bikeName,
          human(s.status),
          fmtDateTime(s.startTime),
          s.startKm,
          s.startAddress ||
            (s.startLat != null ? `${s.startLat}, ${s.startLng}` : ""),
          fmtDateTime(s.endTime),
          s.endKm,
          s.endAddress || (s.endLat != null ? `${s.endLat}, ${s.endLng}` : ""),
          s.endTime
            ? hhmm((new Date(s.endTime) - new Date(s.startTime)) / 60000)
            : "",
          s.distanceKm,
          s.fuelRate != null ? Number(s.fuelRate) : "",
          s.allowance != null ? Number(s.allowance) : "",
          s._count.visits,
        ]);
        cursor = batch[batch.length - 1].id;
      }
    },
  },
  employees: {
    title: "Employees",
    columns: [
      ["Name", 22],
      ["Email", 28],
      ["Role", 14],
      ["Employee Code", 14],
      ["Phone", 16],
      ["Reporting Manager", 20],
      ["Zone", 18],
      ["State", 14],
      ["District", 14],
      ["Bike", 18],
      ["Mileage KM/L", 12],
      ["DL Number", 18],
      ["Status", 10],
      ["Last Login", 20],
      ["Joined", 14],
    ],
    where: (req) => ({
      ...(req.query.role && { role: req.query.role }),
      ...(req.user.role === "MANAGER"
        ? { managerId: req.user.id }
        : req.query.managerId && { managerId: req.query.managerId }),
    }),
    async *rows(where) {
      let cursor;
      for (;;) {
        const batch = await prisma.user.findMany({
          where,
          include: {
            manager: { select: { name: true } },
            zone: { select: { name: true } },
          },
          orderBy: { id: "asc" },
          take: BATCH,
          ...(cursor && { skip: 1, cursor: { id: cursor } }),
        });
        if (!batch.length) return;
        yield batch.map((u) => [
          u.name,
          u.email,
          u.role === "FIELD_VISITOR" ? "Field Employee" : human(u.role),
          u.employeeCode,
          u.phone,
          u.manager?.name,
          u.zone?.name,
          u.state,
          u.district,
          u.bikeName,
          u.bikeMileage,
          u.dlNumber,
          u.isActive ? "Active" : "Inactive",
          fmtDateTime(u.lastLoginAt),
          fmtDate(u.createdAt),
        ]);
        cursor = batch[batch.length - 1].id;
      }
    },
  },
};

// Incentive report (computed, not a table scan) – admin & manager scoped by the report builder
datasets.incentives = {
  title: "Incentives",
  columns: [
    ["Month", 10],
    ["Name", 22],
    ["Role", 14],
    ["Manager", 20],
    ["Basis", 10],
    ["Deals", 8],
    ["Plan Amount (INR)", 16],
    ["Incentive (INR)", 14],
    ["Breakdown", 70],
    ["Paid (INR)", 12],
    ["Paid On", 16],
    ["Payout Note", 30],
  ],
  where: async (req) => buildIncentiveReport(req),
  async *rows(report) {
    yield report.rows.map((r) => [
      report.month,
      r.user.name,
      r.user.role === "MANAGER" ? "Manager" : "Field Employee",
      r.user.manager,
      r.basis === "team" ? "Team" : "Own",
      r.deals,
      r.amount,
      r.total,
      r.lines.map((l) => `${l.name}: ₹${l.earned} (${l.explain})`).join(" | "),
      r.payout ? r.payout.amount : "",
      r.payout ? fmtDate(r.payout.paidAt) : "",
      r.payout?.note,
    ]);
  },
};

// ---------- Attendance & working hours (computed per day; Excel gets 3 styled sheets) ----------
const ATT_COLUMNS = [
  ["Date", 12],
  ["Day", 6],
  ["Employee", 22],
  ["Emp Code", 11],
  ["Manager", 18],
  ["Status", 14],
  ["Login Time", 11],
  ["Logout Time", 11],
  ["Late By (h:mm)", 11],
  ["Total Hours (h:mm)", 12],
  ["Break (h:mm)", 10],
  ["Net Working Hours (h:mm)", 14],
  ["Required Hours (h:mm)", 12],
  ["Short By (h:mm)", 11],
  ["Overtime (h:mm)", 11],
  ["Start KM", 10],
  ["End KM", 10],
  ["KMs Travelled", 11],
  ["No. of Visits", 10],
  ["Deals", 7],
  ["Allowance (INR)", 12],
  ["Alerts", 36],
];
const SUM_COLUMNS = [
  ["Employee", 22],
  ["Emp Code", 11],
  ["Manager", 18],
  ["Working Days", 10],
  ["Present", 9],
  ["Absent", 9],
  ["Weekly Off", 9],
  ["Attendance %", 11],
  ["Avg Login Time", 12],
  ["Late Logins", 10],
  ["Short-Hour Days", 11],
  ["Early Logouts", 10],
  ["Not Logged Out", 11],
  ["Total Hours (h:mm)", 12],
  ["Net Working Hours (h:mm)", 14],
  ["Avg Hours / Day (h:mm)", 13],
  ["Overtime (h:mm)", 11],
  ["Shortfall (h:mm)", 11],
  ["KMs Travelled", 11],
  ["No. of Visits", 10],
  ["Deals", 7],
  ["Allowance (INR)", 12],
  ["Total Alerts", 10],
];

/** text=true → CSV-friendly strings; otherwise Excel serial values (formatted by column) */
function attendanceRow(r, req, text) {
  const t = (mins) => (mins == null ? "" : text ? clock(mins) : mins / 1440);
  const d = (mins) => (mins == null ? "" : text ? hhmm(mins) : mins / 1440);
  const done = r.status === "Present";
  return [
    r.date,
    r.day,
    r.user.name,
    r.user.employeeCode,
    r.user.manager,
    r.status,
    t(r.loginMin),
    t(r.logoutMin),
    r.loginMin != null ? d(r.lateMinutes) : "",
    d(r.dutyMinutes),
    d(r.breakMinutes),
    d(r.netMinutes),
    r.status === "Weekly off" ? "" : d(req),
    done ? d(r.shortMinutes) : "",
    done ? d(r.overtimeMinutes) : "",
    r.startKm ?? "",
    r.endKm ?? "",
    r.distanceKm ?? "",
    r.shiftId ? r.visits : "",
    r.shiftId ? r.deals : "",
    r.allowance ?? "",
    r.alerts.join(", "),
  ];
}
function summaryRow(s, text) {
  const d = (mins) => (mins == null ? "" : text ? hhmm(mins) : mins / 1440);
  return [
    s.user.name,
    s.user.employeeCode,
    s.user.manager,
    s.workingDays,
    s.present,
    s.absent,
    s.weeklyOff,
    s.attendancePct != null
      ? text
        ? `${s.attendancePct}%`
        : s.attendancePct / 100
      : "",
    s.avgLoginMin == null
      ? ""
      : text
        ? clock(s.avgLoginMin)
        : s.avgLoginMin / 1440,
    s.lateDays,
    s.shortDays,
    s.earlyLogouts,
    s.notLoggedOut,
    d(s.dutyMinutes),
    d(s.netMinutes),
    d(s.avgDutyMinutes),
    d(s.overtimeMinutes),
    d(s.shortMinutes),
    s.distanceKm,
    s.visits,
    s.deals,
    s.allowance,
    s.alerts,
  ];
}

function styleHeader(ws, argb = "FF4F46E5") {
  const head = ws.getRow(1);
  head.font = font("FFFFFFFF");
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 32;
}
const font = (argb, bold = true) => ({
  name: "Calibri",
  size: 11,
  bold,
  color: { argb },
});
const fill = (argb) => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

datasets.attendance = {
  title: "Attendance & Working Hours",
  columns: ATT_COLUMNS,
  where: (req) => buildAttendanceReport(req),
  async *rows(report) {
    const req = report.ruleMinutes.requiredMin;
    yield report.rows.map((r) => attendanceRow(r, req, true));
  },
  /** Styled multi-sheet workbook */
  async xlsx(report, res) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Field Sales CRM";
    const rm = report.ruleMinutes;
    const TIME = "hh:mm AM/PM";
    const DUR = "[h]:mm";

    // Sheet 1 – day-wise
    const ws = wb.addWorksheet("Day-wise Attendance", {
      views: [{ state: "frozen", ySplit: 1, xSplit: 3 }],
    });
    ws.columns = ATT_COLUMNS.map(([header, width]) => ({ header, width }));
    styleHeader(ws);
    [7, 8].forEach((c) => (ws.getColumn(c).numFmt = TIME));
    [9, 10, 11, 12, 13, 14, 15].forEach((c) => (ws.getColumn(c).numFmt = DUR));
    ws.getColumn(21).numFmt = "#,##0.00";
    for (const r of report.rows) {
      const row = ws.addRow(attendanceRow(r, rm.requiredMin, false));
      if (r.status === "Absent") row.fill = fill("FFFEE2E2");
      else if (r.status === "Weekly off") row.font = font("FF94A3B8", false);
      else if (r.status === "Not logged out") row.fill = fill("FFFEF3C7");
      if (r.alerts.includes("Late login"))
        row.getCell(7).font = font("FFDC2626");
      if (r.alerts.includes("Early logout"))
        row.getCell(8).font = font("FFDC2626");
      if (r.alerts.includes("Short hours")) {
        row.getCell(10).font = font("FFDC2626");
        row.getCell(14).font = font("FFDC2626");
      }
      if (r.overtimeMinutes > 0) row.getCell(15).font = font("FF059669");
      if (r.alerts.length) row.getCell(22).font = font("FFB91C1C");
    }
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: ATT_COLUMNS.length },
    };

    // Sheet 2 – per employee summary
    const ss = wb.addWorksheet("Employee Summary", {
      views: [{ state: "frozen", ySplit: 1, xSplit: 1 }],
    });
    ss.columns = SUM_COLUMNS.map(([header, width]) => ({ header, width }));
    styleHeader(ss, "FF0F172A");
    ss.getColumn(8).numFmt = "0%";
    ss.getColumn(9).numFmt = TIME;
    [14, 15, 16, 17, 18].forEach((c) => (ss.getColumn(c).numFmt = DUR));
    ss.getColumn(22).numFmt = "#,##0.00";
    for (const s of report.summary) {
      const row = ss.addRow(summaryRow(s, false));
      if (s.absent) row.getCell(6).font = font("FFDC2626");
      if (s.lateDays) row.getCell(10).font = font("FFDC2626");
      if (s.shortDays) row.getCell(11).font = font("FFDC2626");
      if (s.avgLoginMin != null && s.avgLoginMin > rm.lateAfterMin)
        row.getCell(9).font = font("FFDC2626");
    }
    ss.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: SUM_COLUMNS.length },
    };

    // Sheet 3 – the rules used
    const rs = wb.addWorksheet("Rules");
    rs.columns = [
      { header: "Rule", width: 34 },
      { header: "Value", width: 44 },
    ];
    styleHeader(rs, "FF334155");
    const R = report.rules;
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    [
      ["Report period", `${report.from} to ${report.to}`],
      ["Generated on", fmtDateTime(new Date())],
      ["Normal login time", clock(rm.startMin)],
      [
        "Late login after",
        `${clock(rm.lateAfterMin)} (${R.lateGraceMinutes} min grace)`,
      ],
      ["Working hours per day (incl. break)", `${hhmm(rm.requiredMin)} hrs`],
      ["Break included", `${hhmm(rm.breakMin)} hrs`],
      ["Net working hours required", `${hhmm(rm.netRequiredMin)} hrs`],
      ["Expected logout time", clock(rm.expectedEndMin)],
      ["Weekly off", R.weeklyOff.map((d) => days[d]).join(", ") || "None"],
      ["Login / Logout", "Shift punch-in / punch-out time from the field app"],
      [
        "Alerts",
        "Late login · Short hours (< required hours) · Early logout (before expected logout) · Not logged out (shift left open) · Absent · No visits",
      ],
    ].forEach((r) => rs.addRow(r));
    rs.getColumn(2).alignment = { wrapText: true, vertical: "top" };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await wb.xlsx.write(res);
    res.end();
  },
};

const csvCell = (v) => {
  if (v == null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV formula-injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get(
  "/:type",
  asyncHandler(async (req, res) => {
    const ds = datasets[req.params.type];
    if (!ds) throw new HttpError(404, "Unknown export type");
    const format = req.query.format === "xlsx" ? "xlsx" : "csv";
    const where = await ds.where(req);
    const filename = `${req.params.type}-${localDate()}.${format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");

    if (format === "xlsx" && ds.xlsx) return ds.xlsx(where, res);

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.write("﻿" + ds.columns.map((c) => csvCell(c[0])).join(",") + "\n");
      for await (const batch of ds.rows(where)) {
        res.write(batch.map((r) => r.map(csvCell).join(",")).join("\n") + "\n");
      }
      return res.end();
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
    });
    wb.creator = "Field Sales CRM";
    const ws = wb.addWorksheet(ds.title, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = ds.columns.map(([header, width]) => ({ header, width }));
    const head = ws.getRow(1);
    head.font = font("FFFFFFFF");
    head.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    head.commit();
    for await (const batch of ds.rows(where))
      for (const r of batch)
        ws.addRow(r.map((v) => (v == null ? "" : v))).commit();
    ws.commit();
    await wb.commit();
  }),
);

export default router;
