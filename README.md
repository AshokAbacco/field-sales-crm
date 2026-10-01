# Field Sales CRM

Production-ready rebuild of the field-sales demo with two roles:

| Role | What they do |
|---|---|
| **Admin** | Dashboard (attendance, pipeline, revenue, fleet KM, team targets), live GPS tracking, all visits & deals (status + guidance notes), travel & reimbursement audit with route trace, **create/edit/deactivate employee accounts** (incl. DL photo, bike, territory), teams & monthly targets, zones, fuel rate. **CSV & Excel export** for visits, travel/shifts and employees. |
| **Field Visitor** | Start/End day shift with bike odometer + GPS, background GPS route tracking (offline-buffered), log GPS-tagged visits, update status / follow-ups, see admin guidance, travel log with allowance, route trace map, change password. |

**Stack:** React 18 + Vite (`.jsx`), React Router, react-icons, Tailwind CSS, Google Maps (`@vis.gl/react-google-maps`) · Node.js + Express · PostgreSQL · Prisma ORM.

---

## 1. Prerequisites
- Node.js 18.18+ (20 LTS recommended)
- PostgreSQL 14+ (or run `docker compose up -d` to start one locally)
- A Google Maps JavaScript API key (enable **Maps JavaScript API**, and **Geocoding API** for auto address)

## 2. Setup

```bash
# from the project root
npm run install:all

# backend env
cp server/.env.example server/.env      # edit DATABASE_URL, JWT_SECRET, SEED_ADMIN_*
# frontend env
cp client/.env.example client/.env      # set VITE_GOOGLE_MAPS_API_KEY

# create tables + seed admin (and demo data if SEED_DEMO_DATA=true)
npm run setup
```

## 3. Run in development

```bash
npm run dev:server   # http://localhost:5000
npm run dev:client   # http://localhost:5173  (proxies /api to :5000)
```

Default logins (from seed):
- Admin: `admin@company.com` / `Admin@12345` (change via `SEED_ADMIN_*` before seeding, and change the password after first login)
- Demo field visitors (only when `SEED_DEMO_DATA=true`): `amit@company.com`, `priya@company.com`, `rohit@company.com` / `Field@12345`

> GPS needs HTTPS in browsers (localhost is allowed). Deploy behind HTTPS for field use on phones.

## 4. Production

**Option A – single server (API also serves the built React app)**
```bash
npm run build                 # builds client/dist
# server/.env: NODE_ENV=production, CORS_ORIGINS=https://your-domain.com
npm --prefix server run db:deploy
npm start
```

**Option B – separate hosting**: deploy `client/dist` to any static host / CDN with SPA fallback to `index.html`, set `VITE_API_URL=https://api.your-domain.com` before building, and add the frontend origin to `CORS_ORIGINS` on the API.

Recommended: run the API with PM2 / systemd / Docker behind Nginx with HTTPS, use a managed Postgres, and put `UPLOAD_DIR` on persistent storage (or swap the multer disk storage for S3).

## 5. Scalability & security notes
- All list endpoints are server-paginated; filters and search run in SQL with indexes on hot columns (visits by user/date/status, shifts by date, pings by shift/time).
- Exports stream in 1,000-row cursor batches (CSV with BOM for Excel, XLSX via streaming writer) – safe for very large tables; CSV cells are guarded against formula injection.
- Live map uses `DISTINCT ON` to fetch only the latest ping per shift.
- GPS pings are throttled on device (`VITE_GPS_PING_SECONDS`), queued offline in the browser and sent in batches.
- JWT auth, bcrypt password hashes, role guards on every admin route, login rate limiting, Helmet, Zod input validation, upload type/size limits, DL photos served only to admins.
- Employees with visit history are deactivated rather than deleted, so reports stay intact.
- Business dates (shift day, "today", month) use `APP_TIMEZONE` (default Asia/Kolkata).

## 6. Project structure
```
server/
  prisma/schema.prisma        data model
  prisma/migrations/          SQL migrations (prisma migrate deploy)
  prisma/seed.js              admin + optional demo data
  src/index.js                Express app
  src/routes/                 auth, users, shifts, visits, dashboard, org, exports
client/
  src/pages/field/            field visitor screens
  src/pages/admin/            admin screens
  src/components/             Modal, maps, tables, shift/visit modals, UI kit
```

## 7. API overview
| Method | Path | Who |
|---|---|---|
| POST | /api/auth/login, GET /api/auth/me, POST /api/auth/change-password | all |
| GET/POST/PATCH/DELETE | /api/users | admin |
| GET /api/shifts/today · POST /api/shifts/start · POST /api/shifts/:id/end · POST /api/shifts/:id/pings | | field visitor |
| GET /api/shifts · GET /api/shifts/:id/route | | own / admin all |
| GET/POST/PATCH /api/visits · DELETE /api/visits/:id | | own / admin all |
| GET /api/dashboard/me · /admin · /live | | role-based |
| /api/org/zones · /api/org/teams · /api/org/settings | | admin writes |
| GET /api/exports/{visits\|shifts\|employees}?format=csv\|xlsx&from&to&userId&status | | admin |
