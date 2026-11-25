import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiClock,
  FiLogIn,
  FiLogOut,
  FiMap,
  FiUserX,
  FiCalendar,
  FiTruck,
  FiMapPin,
} from "react-icons/fi";
import { useApi } from "../hooks/useApi.js";
import { EmptyState, ErrorState, PageLoader, Pagination } from "./ui.jsx";
import { fmtDayStr, fmtINR, fmtKm, fmtTime } from "../utils/format.js";

/** 125 → "2h 05m" */
export const fmtMins = (m) => {
  if (m == null) return "—";
  const a = Math.max(0, Math.round(m));
  return `${Math.floor(a / 60)}h ${String(a % 60).padStart(2, "0")}m`;
};
/** 540 → "9:00 AM" */
export const fmtClock = (m) => {
  if (m == null) return "—";
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(Math.round(m % 60)).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const ALERT_TONE = {
  "Late login": "bg-amber-50 text-amber-700 ring-amber-200",
  "Short hours": "bg-red-50 text-red-700 ring-red-200",
  "Early logout": "bg-orange-50 text-orange-700 ring-orange-200",
  "Not logged out": "bg-yellow-50 text-yellow-800 ring-yellow-300",
  "Not logged in": "bg-rose-50 text-rose-700 ring-rose-200",
  Absent: "bg-rose-50 text-rose-700 ring-rose-200",
  "No visits": "bg-slate-100 text-slate-600 ring-slate-200",
};
const STATUS_TONE = {
  Present: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "On field": "bg-sky-50 text-sky-700 ring-sky-200",
  Absent: "bg-rose-50 text-rose-700 ring-rose-200",
  "Not logged in": "bg-rose-50 text-rose-700 ring-rose-200",
  "Not logged out": "bg-yellow-50 text-yellow-800 ring-yellow-300",
  "Weekly off": "bg-slate-100 text-slate-500 ring-slate-200",
};
const Pill = ({ tone, children }) => (
  <span
    className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${tone}`}
  >
    {children}
  </span>
);

const PAGE = 50;

/**
 * Day-wise login / logout, working hours (9 hrs incl. 1 hr break), KMs, visits and alerts.
 * Props: params (scope + from/to), reps (filter options), onRoute(shiftId)
 */
export default function AttendanceReport({
  params,
  reps,
  onRoute,
  userId,
  setUserId,
}) {
  const [view, setView] = useState("days");
  const [alert, setAlert] = useState("");
  const [page, setPage] = useState(1);
  const q = useApi("/attendance", { ...params, userId });
  useEffect(() => setPage(1), [params.from, params.to, userId, alert, view]);

  const data = q.data;
  const rows = useMemo(
    () =>
      (data?.rows || []).filter(
        (r) =>
          !alert ||
          (alert === "any" ? r.alerts.length > 0 : r.alerts.includes(alert)),
      ),
    [data, alert],
  );

  if (q.loading && !data) return <PageLoader />;
  if (q.error && !data)
    return <ErrorState message={q.error} onRetry={q.refetch} />;
  const t = data.totals;
  const rm = data.ruleMinutes;
  const chips = [
    ["Late login", t.late, FiLogIn],
    ["Short hours", t.shortHours, FiClock],
    ["Early logout", t.earlyLogout, FiLogOut],
    ["Not logged out", t.notLoggedOut, FiAlertTriangle],
    ["Absent", t.absent, FiUserX],
    ["No visits", t.noVisits, FiMapPin],
  ];
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const meta = {
    page,
    pageSize: PAGE,
    total: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / PAGE)),
  };

  return (
    <div className={q.loading ? "opacity-60" : ""}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          className="input !w-auto !py-2"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">All representatives</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm font-semibold">
          {[
            ["days", "Day-wise"],
            ["summary", "Employee summary"],
          ].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`rounded-md px-3 py-1.5 ${view === k ? "bg-white shadow-sm" : "text-slate-500"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-slate-500">
          Login {fmtClock(rm.startMin)} (late after {fmtClock(rm.lateAfterMin)})
          · {fmtMins(rm.requiredMin)} day incl. {fmtMins(rm.breakMin)} break ·
          logout {fmtClock(rm.expectedEndMin)}
        </p>
      </div>

      {/* Alert summary – click to filter */}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          onClick={() => setAlert(alert === "any" ? "" : "any")}
          className={`rounded-xl px-3 py-2 text-left text-xs ring-1 ${alert === "any" ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-200 hover:bg-slate-50"}`}
        >
          <span className="block font-semibold">All alerts</span>
          <span className="text-lg font-extrabold">
            {(data.rows || []).filter((r) => r.alerts.length).length}
          </span>
        </button>
        {chips.map(([k, n, Icon]) => (
          <button
            key={k}
            onClick={() => setAlert(alert === k ? "" : k)}
            className={`rounded-xl px-3 py-2 text-left text-xs ring-1 ${alert === k ? "bg-slate-900 text-white ring-slate-900" : n ? `${ALERT_TONE[k]} hover:opacity-80` : "bg-white text-slate-500 ring-slate-200"}`}
          >
            <span className="flex items-center gap-1 font-semibold">
              <Icon size={12} /> {k}
            </span>
            <span className="text-lg font-extrabold">{n}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>
            <FiCalendar className="mr-1 inline" />
            Present <b>{t.present}</b>
          </span>
          <span>
            <FiClock className="mr-1 inline" />
            <b>{fmtMins(t.dutyMinutes)}</b>
          </span>
          <span>
            <FiTruck className="mr-1 inline" />
            <b>{fmtKm(t.distanceKm)}</b>
          </span>
          <span>
            <FiMapPin className="mr-1 inline" />
            <b>{t.visits}</b> visits
          </span>
        </div>
      </div>

      {view === "summary" ? (
        <Summary data={data} rm={rm} />
      ) : (
        <div className="card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              title="No attendance in this period"
              icon={FiCalendar}
            />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[1150px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Representative</th>
                    <th className="th">Status</th>
                    <th className="th">Login</th>
                    <th className="th">Logout</th>
                    <th className="th">Total hrs</th>
                    <th className="th">Net (− break)</th>
                    <th className="th">Short / OT</th>
                    <th className="th">KMs</th>
                    <th className="th">Visits</th>
                    <th className="th">Alerts</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((r) => (
                    <tr
                      key={`${r.user.id}-${r.date}`}
                      className={`hover:bg-slate-50 ${r.status === "Weekly off" ? "text-slate-400" : ""}`}
                    >
                      <td className="td">
                        <p className="font-semibold">{fmtDayStr(r.date)}</p>
                        <p className="text-xs text-slate-500">{r.day}</p>
                      </td>
                      <td className="td">
                        <p className="font-medium">{r.user.name}</p>
                        <p className="text-xs text-slate-500">
                          {[r.user.employeeCode, r.user.manager]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </td>
                      <td className="td">
                        <Pill
                          tone={STATUS_TONE[r.status] || STATUS_TONE.Present}
                        >
                          {r.status}
                        </Pill>
                      </td>
                      <td className="td">
                        {r.loginAt ? (
                          <>
                            <p
                              className={
                                r.alerts.includes("Late login")
                                  ? "font-bold text-red-600"
                                  : ""
                              }
                            >
                              {fmtTime(r.loginAt)}
                            </p>
                            {r.lateMinutes > 0 && (
                              <p className="text-xs text-slate-500">
                                {fmtMins(r.lateMinutes)} late
                              </p>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="td">
                        <p
                          className={
                            r.alerts.includes("Early logout")
                              ? "font-bold text-red-600"
                              : ""
                          }
                        >
                          {r.logoutAt ? fmtTime(r.logoutAt) : "—"}
                        </p>
                      </td>
                      <td className="td">
                        <p
                          className={`font-bold ${r.alerts.includes("Short hours") ? "text-red-600" : ""}`}
                        >
                          {fmtMins(r.dutyMinutes)}
                        </p>
                        {r.status === "On field" && (
                          <p className="text-[11px] text-sky-600">so far</p>
                        )}
                      </td>
                      <td className="td">{fmtMins(r.netMinutes)}</td>
                      <td className="td text-xs">
                        {r.shortMinutes > 0 ? (
                          <span className="font-semibold text-red-600">
                            −{fmtMins(r.shortMinutes)}
                          </span>
                        ) : r.overtimeMinutes > 0 ? (
                          <span className="font-semibold text-emerald-600">
                            +{fmtMins(r.overtimeMinutes)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="td">
                        {r.distanceKm != null ? (
                          <>
                            <p className="font-semibold">{r.distanceKm} KM</p>
                            <p className="text-xs text-slate-500">
                              {r.startKm} → {r.endKm}
                            </p>
                          </>
                        ) : r.startKm != null ? (
                          <p className="text-xs text-slate-500">
                            from {r.startKm}
                          </p>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="td">
                        {r.shiftId ? (
                          <>
                            <p className="font-semibold">{r.visits}</p>
                            {r.deals > 0 && (
                              <p className="text-xs text-emerald-600">
                                {r.deals} deal{r.deals > 1 ? "s" : ""}
                              </p>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="td">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {r.alerts.map((a) => (
                            <Pill key={a} tone={ALERT_TONE[a]}>
                              {a}
                            </Pill>
                          ))}
                        </div>
                      </td>
                      <td className="td text-right">
                        {r.shiftId && onRoute && (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => onRoute(r.shiftId)}
                          >
                            <FiMap /> Trace
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination meta={meta} onPage={setPage} />
        </div>
      )}
    </div>
  );
}

function Summary({ data, rm }) {
  const rows = data.summary;
  if (!rows.length)
    return <EmptyState title="No employees" icon={FiCalendar} />;
  return (
    <div className="card overflow-hidden">
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th className="th">Representative</th>
              <th className="th">Present / days</th>
              <th className="th">Absent</th>
              <th className="th">Avg login</th>
              <th className="th">Late logins</th>
              <th className="th">Total hrs</th>
              <th className="th">Avg hrs / day</th>
              <th className="th">Short-hour days</th>
              <th className="th">Not logged out</th>
              <th className="th">KMs</th>
              <th className="th">Visits</th>
              <th className="th">Allowance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.user.id} className="hover:bg-slate-50">
                <td className="td">
                  <p className="font-medium">{s.user.name}</p>
                  <p className="text-xs text-slate-500">
                    {[s.user.employeeCode, s.user.manager]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </td>
                <td className="td">
                  <p className="font-semibold">
                    {s.present} / {s.workingDays}
                  </p>
                  {s.attendancePct != null && (
                    <p className="text-xs text-slate-500">{s.attendancePct}%</p>
                  )}
                </td>
                <td
                  className={`td ${s.absent ? "font-bold text-rose-600" : ""}`}
                >
                  {s.absent}
                </td>
                <td
                  className={`td ${s.avgLoginMin != null && s.avgLoginMin > rm.lateAfterMin ? "font-bold text-red-600" : ""}`}
                >
                  {fmtClock(s.avgLoginMin)}
                </td>
                <td
                  className={`td ${s.lateDays ? "font-bold text-amber-600" : ""}`}
                >
                  {s.lateDays}
                </td>
                <td className="td font-semibold">{fmtMins(s.dutyMinutes)}</td>
                <td
                  className={`td ${s.avgDutyMinutes != null && s.avgDutyMinutes < rm.requiredMin ? "font-bold text-red-600" : ""}`}
                >
                  {fmtMins(s.avgDutyMinutes)}
                </td>
                <td
                  className={`td ${s.shortDays ? "font-bold text-red-600" : ""}`}
                >
                  {s.shortDays}
                </td>
                <td
                  className={`td ${s.notLoggedOut ? "font-bold text-yellow-700" : ""}`}
                >
                  {s.notLoggedOut}
                </td>
                <td className="td">{fmtKm(s.distanceKm)}</td>
                <td className="td">{s.visits}</td>
                <td className="td text-emerald-700">{fmtINR(s.allowance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
