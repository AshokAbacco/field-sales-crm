export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
export const fmtTime = (d) =>
  d
    ? new Date(d).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const fmtDateTime = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : "—");
export const fmtDayStr = (s) => (s ? fmtDate(`${s}T00:00:00`) : "—");
export const fmtINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
export const fmtKm = (n) =>
  `${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} KM`;
export const pct = (a, b) =>
  b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;
export const initials = (name = "") =>
  name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const monthStartStr = () => `${todayStr().slice(0, 8)}01`;
export const toInputDate = (d) =>
  d ? new Date(d).toISOString().slice(0, 10) : "";
export const mapsLink = (lat, lng) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const timeAgo = (d) => {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return fmtDate(d);
};
