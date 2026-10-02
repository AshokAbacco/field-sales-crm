import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config, isProd } from "./lib/config.js";
import { prisma } from "./lib/prisma.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import shiftRoutes from "./routes/shifts.js";
import visitRoutes from "./routes/visits.js";
import dashboardRoutes from "./routes/dashboard.js";
import orgRoutes from "./routes/org.js";
import exportRoutes from "./routes/exports.js";
import catalogRoutes from "./routes/catalog.js";
import leadRoutes from "./routes/leads.js";
import incentiveRoutes from "./routes/incentives.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

// CSP disabled because the SPA loads Google Maps scripts/tiles; tighten per deployment if needed
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors({
    origin: (origin, cb) =>
      !origin ||
      config.corsOrigins.includes("*") ||
      config.corsOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error("CORS blocked")),
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  }),
);
app.use(
  compression({
    filter: (req, res) =>
      !req.path.startsWith("/api/exports") && compression.filter(req, res),
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(isProd ? "combined" : "dev"));

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "up", time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, db: "down" });
  }
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", requireAuth, userRoutes);
app.use("/api/shifts", requireAuth, shiftRoutes);
app.use("/api/visits", requireAuth, visitRoutes);
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/org", requireAuth, orgRoutes);
app.use("/api/exports", requireAuth, exportRoutes);
app.use("/api/catalog", requireAuth, catalogRoutes);
app.use("/api/leads", requireAuth, leadRoutes);
app.use("/api/incentives", requireAuth, incentiveRoutes);

// Uploaded files (DL photos) – admin, or manager for own employees
const uploadRoot = path.resolve(config.uploadDir);
app.get(
  "/uploads/*",
  (req, _res, next) => {
    if (!req.headers.authorization && req.query.token)
      req.headers.authorization = `Bearer ${req.query.token}`;
    next();
  },
  requireAuth,
  requireRole("ADMIN", "MANAGER"),
  async (req, res, next) => {
    try {
      const file = path.resolve(uploadRoot, req.params[0]);
      if (!file.startsWith(uploadRoot) || !fs.existsSync(file)) return next();
      if (req.user.role === "MANAGER") {
        // Managers may only open documents of their own employees
        const owner = await prisma.user.findFirst({
          where: {
            dlPhotoUrl: `/uploads/${req.params[0]}`,
            managerId: req.user.id,
          },
          select: { id: true },
        });
        if (!owner) return res.status(404).end();
      }
      res.sendFile(file);
    } catch (e) {
      next(e);
    }
  },
);

// Optionally serve built client from same origin
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
if (isProd && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: "7d", index: false }));
  app.get(/^\/(?!api|uploads).*/, (_req, res) =>
    res.sendFile(path.join(clientDist, "index.html")),
  );
}

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

const server = app.listen(config.port, () =>
  console.log(`[server] listening on :${config.port} (${config.env})`),
);

const shutdown = async (sig) => {
  console.log(`[server] ${sig} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
