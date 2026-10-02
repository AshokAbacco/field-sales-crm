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
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
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
