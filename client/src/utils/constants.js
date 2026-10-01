// Business categories, software products and plans are managed in Settings (see hooks/useCatalog.js)

export const BILLING_CYCLES = [
  { value: "MONTHLY", label: "Monthly", short: "/mo", months: 1 },
  { value: "QUARTERLY", label: "Quarterly", short: "/qtr", months: 3 },
  { value: "HALF_YEARLY", label: "Half-yearly", short: "/6 mo", months: 6 },
  { value: "YEARLY", label: "Yearly", short: "/yr", months: 12 },
  { value: "ONE_TIME", label: "One-time", short: " once", months: 0 },
];
export const cycleMeta = (v) => BILLING_CYCLES.find((c) => c.value === v);
/** Next payment date (YYYY-MM-DD) one billing cycle after `from` */
export const nextPaymentFor = (cycle, from = new Date()) => {
  const m = cycleMeta(cycle)?.months;
  if (!m) return "";
  const d = new Date(from);
  d.setMonth(d.getMonth() + m);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const STATUSES = [
  {
    value: "OPEN",
    label: "Open",
    cls: "bg-sky-50 text-sky-700 ring-sky-200",
    dot: "bg-sky-500",
  },
  {
    value: "FOLLOW_UP",
    label: "Follow-Up",
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
  },
  {
    value: "DEAL_DONE",
    label: "Deal Done",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  {
    value: "LEAVE_OUT",
    label: "Leave Out",
    cls: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500",
  },
];
export const statusMeta = (v) =>
  STATUSES.find((s) => s.value === v) || STATUSES[0];

export const STATES = [
  "Karnataka",
  "Maharashtra",
  "Tamil Nadu",
  "Telangana",
  "Kerala",
  "Andhra Pradesh",
  "Delhi NCR",
  "Gujarat",
  "Uttar Pradesh",
  "West Bengal",
  "Rajasthan",
  "Other",
];
export const SEGMENTS = [
  "Garages & Bike Detailing Hub",
  "Restaurants & Cloud Kitchens",
  "Supermarkets & Groceries",
  "Multi-Segment Commercial",
];

export const ROLES = {
  ADMIN: { label: "Admin", cls: "bg-slate-900 text-white" },
  MANAGER: {
    label: "Manager",
    cls: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
  },
  FIELD_VISITOR: {
    label: "Field Employee",
    cls: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200",
  },
};
export const roleLabel = (r) => ROLES[r]?.label || r;
export const homePath = (u) =>
  u?.role === "ADMIN"
    ? "/admin"
    : u?.role === "MANAGER"
      ? "/manager"
      : "/field";
