import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, paginate, pageMeta } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { dateRange, localDate, startOfLocalDay, addDays } from "../lib/date.js";
import { scopedUserWhere, canAccessUser } from "../lib/scope.js";

const router = Router();

const STATUSES = ["OPEN", "FOLLOW_UP", "DEAL_DONE", "LEAVE_OUT"];
const CYCLES = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "ONE_TIME"];

const optStr = (max = 300) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v));
const optNum = (min, max) =>
  z
    .preprocess(
      (v) => (v === "" || v == null ? null : Number(v)),
      z.number().min(min).max(max).nullable(),
    )
    .optional();
const optDate = z
  .preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.date().nullable(),
  )
  .optional();
const optId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const visitSchema = z.object({
  categoryId: z
    .string({ required_error: "Select a business category" })
    .trim()
    .min(1, "Select a business category"),
  productId: z
    .string({ required_error: "Select a software product" })
    .trim()
    .min(1, "Select a software product"),
  companyName: z.string().trim().min(2, "Business name is required").max(150),
  contactPerson: optStr(100),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{6,18}$/, "Enter a valid phone number"),
  email: z
    .string()
    .trim()
    .email()
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  status: z.enum(STATUSES).default("OPEN"),
  address: z.string().trim().min(3, "Address is required").max(300),
  lat: optNum(-90, 90),
  lng: optNum(-180, 180),
  odometerKm: optNum(0, 9_999_999),
  // Subscription sold
  planId: optId,
  dealValue: optNum(0, 1e12),
  billingCycle: z
    .enum(CYCLES)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  nextPaymentDate: optDate,
  nextFollowUp: optDate,
  notes: optStr(2000),
});
const updateSchema = visitSchema.partial().extend({ adminNote: optStr(2000) });

export const visitInclude = {
  user: {
    select: { id: true, name: true, manager: { select: { name: true } } },
  },
  category: { select: { id: true, name: true } },
};

/**
 * Validate catalog references and fill snapshot fields (product name, plan name, cycle).
 * Inactive items are rejected for new selections but allowed when unchanged on edit.
 */
async function resolveCatalog(data, existing) {
  if (
    data.categoryId !== undefined &&
    data.categoryId !== existing?.categoryId
  ) {
    const c = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { isActive: true },
    });
    if (!c?.isActive)
      throw new HttpError(400, "Selected business category is not available");
  }
  if (data.productId !== undefined && data.productId !== existing?.productId) {
    const p = await prisma.product.findUnique({
      where: { id: data.productId },
      select: { name: true, isActive: true },
    });
    if (!p?.isActive)
      throw new HttpError(400, "Selected software product is not available");
    data.product = p.name;
  }
  if (data.planId !== undefined) {
    if (data.planId && data.planId !== existing?.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
      if (!plan?.isActive)
        throw new HttpError(400, "Selected plan is not available");
      data.planName = plan.name;
      data.billingCycle ||= plan.billingCycle;
      if (data.dealValue == null) data.dealValue = Number(plan.price);
    } else if (!data.planId) {
      data.planName = null;
    }
  }
  const status = data.status ?? existing?.status;
  if (status === "DEAL_DONE") {
    const value =
      data.dealValue !== undefined ? data.dealValue : existing?.dealValue;
    if (value == null)
      throw new HttpError(400, "Enter the plan amount for a closed deal");
  }
  return data;
}

export async function buildVisitWhere(req) {
  const {
    q,
    status,
    categoryId,
    productId,
    planId,
    from,
    to,
    followUpDue,
    paymentDue,
  } = req.query;
  const where = {
    ...(await scopedUserWhere(req)),
    ...(STATUSES.includes(status) && { status }),
    ...(categoryId && { categoryId: String(categoryId) }),
    ...(productId && { productId: String(productId) }),
    ...(planId && { planId: String(planId) }),
    ...(dateRange(from, to) && { visitedAt: dateRange(from, to) }),
    ...(q && {
      OR: [
        { companyName: { contains: q, mode: "insensitive" } },
        { contactPerson: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { address: { contains: q, mode: "insensitive" } },
        { planName: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  if (followUpDue === "true") {
    where.status = "FOLLOW_UP";
    where.nextFollowUp = { lt: startOfLocalDay(addDays(localDate(), 1)) };
  }
  if (paymentDue === "true") {
    // Renewals due within the next 7 days, plus overdue ones
    where.status = "DEAL_DONE";
    where.nextPaymentDate = { lt: startOfLocalDay(addDays(localDate(), 8)) };
    delete where.visitedAt;
  }
  return where;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const pg = paginate(req.query);
    const where = await buildVisitWhere(req);
    const sortField = [
      "visitedAt",
      "companyName",
      "nextFollowUp",
      "nextPaymentDate",
      "status",
      "dealValue",
    ].includes(req.query.sort)
      ? req.query.sort
      : "visitedAt";
    const dir = req.query.dir === "asc" ? "asc" : "desc";
    const [total, rows, byStatus] = await Promise.all([
      prisma.visit.count({ where }),
      prisma.visit.findMany({
        where,
        include: visitInclude,
        orderBy: { [sortField]: dir },
        skip: pg.skip,
        take: pg.take,
      }),
      prisma.visit.groupBy({
        by: ["status"],
        where: { ...where, status: undefined },
        _count: true,
      }),
    ]);
    res.json({
      data: rows,
      meta: pageMeta(total, pg),
      statusCounts: Object.fromEntries(
        byStatus.map((s) => [s.status, s._count]),
      ),
    });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const visit = await prisma.visit.findUnique({
      where: { id: req.params.id },
      include: visitInclude,
    });
    if (!visit || !(await canAccessUser(req, visit.userId)))
      throw new HttpError(404, "Visit not found");
    res.json({ visit });
  }),
);

router.post(
  "/",
  validate(visitSchema),
  asyncHandler(async (req, res) => {
    if (req.user.role !== "FIELD_VISITOR")
      throw new HttpError(403, "Only field employees can log visits");
    const shift = await prisma.shift.findFirst({
      where: { userId: req.user.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!shift)
      throw new HttpError(400, "Start your day shift before logging a visit");
    const data = await resolveCatalog({ ...req.body });
    const visit = await prisma.visit.create({
      data: { ...data, userId: req.user.id, shiftId: shift.id },
      include: visitInclude,
    });
    if (data.lat != null && data.lng != null)
      await prisma.locationPing.create({
        data: {
          userId: req.user.id,
          shiftId: shift.id,
          lat: data.lat,
          lng: data.lng,
        },
      });
    res.status(201).json({ visit });
  }),
);

router.patch(
  "/:id",
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const visit = await prisma.visit.findUnique({
      where: { id: req.params.id },
    });
    if (!visit || !(await canAccessUser(req, visit.userId)))
      throw new HttpError(404, "Visit not found");
    const data = { ...req.body };
    // Guidance notes are written by managers/admins only
    if (req.user.role === "FIELD_VISITOR") delete data.adminNote;
    // Strip undefined so partial updates don't clobber
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    await resolveCatalog(data, visit);
    const updated = await prisma.visit.update({
      where: { id: visit.id },
      data,
      include: visitInclude,
    });
    res.json({ visit: updated });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const visit = await prisma.visit.findUnique({
      where: { id: req.params.id },
    });
    if (!visit) throw new HttpError(404, "Visit not found");
    if (req.user.role !== "ADMIN")
      throw new HttpError(403, "Only admins can delete visits");
    await prisma.visit.delete({ where: { id: visit.id } });
    res.json({ ok: true });
  }),
);

export default router;
