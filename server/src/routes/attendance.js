import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { requireRole } from "../middleware/auth.js";
import {
  buildAttendanceReport,
  getWorkRules,
  saveWorkRules,
  ruleMinutes,
} from "../lib/attendance.js";

const router = Router();

/** Working-hour rules (login time, hours per day, break, grace, weekly off) – readable by everyone */
router.get(
  "/rules",
  asyncHandler(async (_req, res) => {
    const rules = await getWorkRules();
    res.json({ rules, ruleMinutes: ruleMinutes(rules) });
  }),
);

router.put(
  "/rules",
  requireRole("ADMIN"),
  validate(
    z
      .object({
        workStartTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24 hour), e.g. 09:00")
          .optional(),
        workHoursPerDay: z.coerce.number().min(1).max(16).optional(),
        breakMinutes: z.coerce.number().int().min(0).max(240).optional(),
        lateGraceMinutes: z.coerce.number().int().min(0).max(180).optional(),
        weeklyOff: z
          .array(z.coerce.number().int().min(0).max(6))
          .max(6)
          .optional(),
      })
      .refine(
        (v) =>
          v.workHoursPerDay == null ||
          v.breakMinutes == null ||
          v.breakMinutes < v.workHoursPerDay * 60,
        {
          message: "Break must be shorter than the working day",
          path: ["breakMinutes"],
        },
      ),
  ),
  asyncHandler(async (req, res) => {
    const rules = await saveWorkRules(req.body);
    res.json({ rules, ruleMinutes: ruleMinutes(rules) });
  }),
);

/**
 * Day-wise attendance: login / logout time, working hours, break, KMs, visits and alerts.
 * Query: from, to, managerId (admin), userId
 */
router.get(
  "/",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    res.json(await buildAttendanceReport(req));
  }),
);

export default router;
