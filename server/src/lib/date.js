import { config } from './config.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD for a Date in the app timezone */
export function localDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Offset in minutes of app timezone vs UTC at given instant */
function tzOffsetMinutes(at) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** UTC instant for local midnight of a YYYY-MM-DD in app timezone */
export function startOfLocalDay(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d));
  return new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000);
}

export function addDays(dateStr, n) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export const isDateStr = (s) => typeof s === 'string' && DATE_RE.test(s);

/** Build a Prisma DateTime range filter from from/to (inclusive local dates). */
export function dateRange(from, to) {
  const range = {};
  if (isDateStr(from)) range.gte = startOfLocalDay(from);
  if (isDateStr(to)) range.lt = startOfLocalDay(addDays(to, 1));
  return Object.keys(range).length ? range : undefined;
}

/** Same as dateRange but for string `date` columns (YYYY-MM-DD compare lexicographically). */
export function dateStrRange(from, to) {
  const range = {};
  if (isDateStr(from)) range.gte = from;
  if (isDateStr(to)) range.lte = to;
  return Object.keys(range).length ? range : undefined;
}

export function monthBounds(dateStr = localDate()) {
  const first = `${dateStr.slice(0, 7)}-01`;
  const [y, m] = first.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}
