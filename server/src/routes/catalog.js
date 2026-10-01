import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { requireRole } from "../middleware/auth.js";

/**
 * Catalog used by the visit form:
 *  - Categories & software products → managed by Admin
 *  - Subscription plans (name + price + billing cycle) → managed by Admin and Managers
 */
const router = Router();
const CYCLES = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "ONE_TIME"];
const optStr = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const optId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
const bool = z.union([
  z.boolean(),
  z.enum(["true", "false"]).transform((v) => v === "true"),
]);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const all = req.query.all === "true" && req.user.role !== "FIELD_VISITOR";
    const active = all ? {} : { isActive: true };
    const [categories, products, plans] = await Promise.all([
      prisma.category.findMany({
        where: active,
        include: {
          defaultProduct: { select: { id: true, name: true } },
          ...(all && { _count: { select: { visits: true } } }),
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.product.findMany({
        where: active,
        include: all
          ? { _count: { select: { visits: true, plans: true } } }
          : undefined,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.plan.findMany({
        where: active,
        include: {
          product: { select: { id: true, name: true } },
          ...(all && {
            createdBy: { select: { name: true } },
            _count: { select: { visits: true } },
          }),
        },
        orderBy: [{ productId: "asc" }, { price: "asc" }],
      }),
    ]);
    res.json({ categories, products, plans });
  }),
);

/** Delete if unused, otherwise deactivate so old visits keep their history */
async function removeOrDeactivate(model, id, inUse) {
  if (inUse > 0) {
    await prisma[model].update({ where: { id }, data: { isActive: false } });
    return { ok: true, deactivated: true };
  }
  await prisma[model].delete({ where: { id } });
  return { ok: true };
}

// ---------- categories (admin) ----------
const categorySchema = z.object({
  name: z.string().trim().min(2, "Category name is required").max(80),
  defaultProductId: optId,
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: bool.optional(),
});
router.post(
  "/categories",
  requireRole("ADMIN"),
  validate(categorySchema),
  asyncHandler(async (req, res) => {
    const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
    res
      .status(201)
      .json({
        category: await prisma.category.create({
          data: { sortOrder: (max._max.sortOrder || 0) + 1, ...req.body },
        }),
      });
  }),
);
router.patch(
  "/categories/:id",
  requireRole("ADMIN"),
  validate(categorySchema.partial()),
  asyncHandler(async (req, res) => {
    res.json({
      category: await prisma.category.update({
        where: { id: req.params.id },
        data: req.body,
      }),
    });
  }),
);
router.delete(
  "/categories/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    res.json(
      await removeOrDeactivate(
        "category",
        req.params.id,
        await prisma.visit.count({ where: { categoryId: req.params.id } }),
      ),
    );
  }),
);

// ---------- products (admin) ----------
const productSchema = z.object({
  name: z.string().trim().min(2, "Product name is required").max(80),
  description: optStr(300),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: bool.optional(),
});
router.post(
  "/products",
  requireRole("ADMIN"),
  validate(productSchema),
  asyncHandler(async (req, res) => {
    const max = await prisma.product.aggregate({ _max: { sortOrder: true } });
    res
      .status(201)
      .json({
        product: await prisma.product.create({
          data: { sortOrder: (max._max.sortOrder || 0) + 1, ...req.body },
        }),
      });
  }),
);
router.patch(
  "/products/:id",
  requireRole("ADMIN"),
  validate(productSchema.partial()),
  asyncHandler(async (req, res) => {
    res.json({
      product: await prisma.product.update({
        where: { id: req.params.id },
        data: req.body,
      }),
    });
  }),
);
router.delete(
  "/products/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const [visits, plans] = await Promise.all([
      prisma.visit.count({ where: { productId: req.params.id } }),
      prisma.plan.count({ where: { productId: req.params.id } }),
    ]);
    res.json(
      await removeOrDeactivate("product", req.params.id, visits + plans),
    );
  }),
);

// ---------- plans (admin + manager) ----------
const planSchema = z.object({
  name: z.string().trim().min(2, "Plan name is required").max(80),
  productId: optId,
  price: z.coerce
    .number({ invalid_type_error: "Enter a price" })
    .min(0, "Price cannot be negative")
    .max(1e10),
  billingCycle: z.enum(CYCLES).default("MONTHLY"),
  description: optStr(300),
  isActive: bool.optional(),
});
router.post(
  "/plans",
  requireRole("ADMIN", "MANAGER"),
  validate(planSchema),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json({
        plan: await prisma.plan.create({
          data: { ...req.body, createdById: req.user.id },
        }),
      });
  }),
);
router.patch(
  "/plans/:id",
  requireRole("ADMIN", "MANAGER"),
  validate(planSchema.partial()),
  asyncHandler(async (req, res) => {
    const data = { ...req.body };
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    if (
      !(await prisma.plan.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      }))
    )
      throw new HttpError(404, "Plan not found");
    res.json({
      plan: await prisma.plan.update({ where: { id: req.params.id }, data }),
    });
  }),
);
router.delete(
  "/plans/:id",
  requireRole("ADMIN", "MANAGER"),
  asyncHandler(async (req, res) => {
    res.json(
      await removeOrDeactivate(
        "plan",
        req.params.id,
        await prisma.visit.count({ where: { planId: req.params.id } }),
      ),
    );
  }),
);

export default router;
