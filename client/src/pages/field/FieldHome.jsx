import { useEffect, useState } from "react";
import {
  FiPlus,
  FiPlayCircle,
  FiStopCircle,
  FiMap,
  FiCheckCircle,
  FiClock,
  FiTrendingUp,
  FiTruck,
  FiBell,
  FiRadio,
  FiAward,
} from "react-icons/fi";
import { useAuth } from "../../context/AuthContext.jsx";
import { useApi } from "../../hooks/useApi.js";
import { useGpsTracker } from "../../hooks/useGeo.js";
import {
  StatCard,
  PageLoader,
  StatusBadge,
  ProgressBar,
} from "../../components/ui.jsx";
import {
  StartShiftModal,
  EndShiftModal,
  RouteModal,
} from "../../components/ShiftModals.jsx";
import {
  VisitFormModal,
  VisitDetailModal,
} from "../../components/VisitModals.jsx";
import VisitsTable from "../../components/VisitsTable.jsx";
import {
  fmtTime,
  fmtKm,
  fmtINR,
  fmtDayStr,
  fmtDate,
  todayStr,
  pct,
} from "../../utils/format.js";

const minsOfDay = (d) => {
  const x = new Date(d);
  return x.getHours() * 60 + x.getMinutes();
};
const hm = (m) => {
  const a = Math.max(0, Math.round(m));
  return `${Math.floor(a / 60)}h ${String(a % 60).padStart(2, "0")}m`;
};
const clk = (m) =>
  `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${Math.floor(m / 60) % 24 < 12 ? "AM" : "PM"}`;

/** Working-hours progress & alerts for today (login time, 9 hrs incl. 1 hr break) */
function WorkHoursBar({ shift, rm, weeklyOff = [] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (shift?.status !== "ACTIVE") return undefined;
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, [shift?.status]);
  if (!rm) return null;
  const nowMin = minsOfDay(now);
  if (!shift) {
    if (weeklyOff.includes(new Date(now).getDay())) return null;
    const late = nowMin > rm.lateAfterMin;
    return (
      <div
        className={`flex items-center gap-2 border-t px-5 py-2.5 text-xs ${late ? "border-red-100 bg-red-50 text-red-700" : "border-slate-100 bg-slate-50 text-slate-600"}`}
      >
        <FiClock />
        {late
          ? `You have not logged in yet – login time is ${clk(rm.startMin)}. Please start your shift.`
          : `Login time is ${clk(rm.startMin)} · working day ${hm(rm.requiredMin)} incl. ${hm(rm.breakMin)} break.`}
      </div>
    );
  }
  const end = shift.endTime ? new Date(shift.endTime).getTime() : now;
  const worked = Math.max(
    0,
    (end - new Date(shift.startTime).getTime()) / 60000,
  );
  const loginMin = minsOfDay(shift.startTime);
  const late = loginMin > rm.lateAfterMin;
  const short = worked < rm.requiredMin;
  const alerts = [];
  if (late) alerts.push(`Late login by ${hm(loginMin - rm.startMin)}`);
  if (shift.endTime && short)
    alerts.push(`Short by ${hm(rm.requiredMin - worked)}`);
  const pctDone = Math.min(100, Math.round((worked / rm.requiredMin) * 100));
  return (
    <div className="border-t border-slate-100 px-5 py-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1 font-semibold text-slate-700">
          <FiClock /> Working hours {hm(worked)} / {hm(rm.requiredMin)}
          <span className="font-normal text-slate-500">
            (net {hm(Math.max(0, worked - Math.min(rm.breakMin, worked)))} after{" "}
            {hm(rm.breakMin)} break)
          </span>
        </span>
        <span className="flex flex-wrap gap-1">
          {alerts.map((a) => (
            <span
              key={a}
              className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 ring-1 ring-red-200"
            >
              {a}
            </span>
          ))}
          {!shift.endTime && (
            <span className="text-slate-500">
              {short
                ? `Complete at ${clk((loginMin + rm.requiredMin) % 1440)}`
                : "Day complete ✓"}
            </span>
          )}
        </span>
      </div>
      <ProgressBar value={pctDone} tone={short ? "amber" : "green"} />
    </div>
  );
}

export default function FieldHome() {
  const { user } = useAuth();
  const shiftQ = useApi("/shifts/today");
  const summary = useApi("/dashboard/me");
  const incentive = useApi("/incentives/me");
  const [showInc, setShowInc] = useState(false);
  const [page, setPage] = useState(1);
  const today = todayStr();
  const todayVisits = useApi("/visits", {
    from: today,
    to: today,
    page,
    pageSize: 10,
  });
  const dueQ = useApi("/visits", {
    followUpDue: "true",
    pageSize: 5,
    sort: "nextFollowUp",
    dir: "asc",
  });

  const [modal, setModal] = useState(null); // 'start' | 'end' | 'add' | 'route'
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);

  const shift = shiftQ.data?.shift;
  const openPrev = shiftQ.data?.openPrevious;
  const activeShift = shift?.status === "ACTIVE" ? shift : openPrev;
  const lastFix = useGpsTracker(activeShift?.id, !!activeShift);

  const refreshAll = () => {
    shiftQ.refetch(true);
    summary.refetch(true);
    incentive.refetch(true);
    todayVisits.refetch(true);
    dueQ.refetch(true);
  };

  if (shiftQ.loading && !shiftQ.data) return <PageLoader />;
  const s = summary.data;
  const hour = new Date().getHours();
  const greet =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {greet}, {user.name.split(" ")[0]} 👋
          </h1>
        </div>
        <button
          className="btn-primary"
          disabled={!activeShift}
          onClick={() => setModal("add")}
          title={!activeShift ? "Start your shift first" : ""}
        >
          <FiPlus /> Log Visit
        </button>
      </div>

      {/* Shift card */}
      <div
        className={`card overflow-hidden ${activeShift ? "border-emerald-200" : ""}`}
      >
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${activeShift ? "bg-emerald-100 text-emerald-600" : shift ? "bg-slate-100 text-slate-500" : "bg-brand-50 text-brand-600"}`}
            >
              <FiTruck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold">
                  {activeShift
                    ? "On field · shift running"
                    : shift
                      ? "Shift completed"
                      : "Shift not started"}
                </p>
                {activeShift && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500">
                {openPrev
                  ? `You forgot to close your shift from ${fmtDayStr(openPrev.date)}. Please end it now.`
                  : activeShift
                    ? `Punched in at ${fmtTime(activeShift.startTime)} · start ${activeShift.startKm} KM`
                    : shift
                      ? `${fmtTime(shift.startTime)} – ${fmtTime(shift.endTime)} · ${fmtKm(shift.distanceKm)} · ${fmtINR(shift.allowance)}`
                      : "Record your bike odometer and location to begin."}
              </p>
              {activeShift && (
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                  <FiRadio />{" "}
                  {lastFix
                    ? `GPS tracking active · ±${Math.round(lastFix.accuracy)} m`
                    : "Waiting for GPS…"}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(shift || openPrev) && (
              <button
                className="btn-secondary"
                onClick={() => setModal("route")}
              >
                <FiMap /> Route
              </button>
            )}
            {activeShift ? (
              <button className="btn-danger" onClick={() => setModal("end")}>
                <FiStopCircle /> End Shift
              </button>
            ) : (
              !shift && (
                <button
                  className="btn-success"
                  onClick={() => setModal("start")}
                >
                  <FiPlayCircle /> Start Shift
                </button>
              )
            )}
          </div>
        </div>
        <WorkHoursBar
          shift={openPrev ? null : activeShift || shift}
          rm={openPrev ? null : shiftQ.data?.workMinutes}
          weeklyOff={shiftQ.data?.workRules?.weeklyOff}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Today's visits"
          value={s?.todayVisits ?? "–"}
          icon={FiCheckCircle}
          tone="brand"
        />
        <StatCard
          label="Deals this month"
          value={s?.monthDeals ?? "–"}
          icon={FiTrendingUp}
          tone="green"
        />
        <StatCard
          label="Follow-ups due"
          value={s?.followUpsDue ?? "–"}
          icon={FiBell}
          tone="amber"
        />
        <StatCard
          label="KM this month"
          value={s ? Math.round(s.monthKm) : "–"}
          sub={s ? `${fmtINR(s.monthAllowance)} allowance` : ""}
          icon={FiTruck}
          tone="sky"
        />
      </div>

      {s?.target && (s.target.visits > 0 || s.target.deals > 0) && (
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">
              My target this month · {s.target.team}
            </p>
            {s.manager && (
              <p className="text-xs text-slate-500">
                Manager: <b className="text-slate-700">{s.manager.name}</b>
                {s.manager.phone && (
                  <a
                    className="ml-2 font-semibold text-brand-600"
                    href={`tel:${s.manager.phone}`}
                  >
                    Call
                  </a>
                )}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
                <span>Visits</span>
                <span>
                  {s.monthVisits} / {s.target.visits}
                </span>
              </div>
              <ProgressBar value={pct(s.monthVisits, s.target.visits)} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
                <span>Deals</span>
                <span>
                  {s.monthDeals} / {s.target.deals}
                </span>
              </div>
              <ProgressBar
                value={pct(s.monthDeals, s.target.deals)}
                tone="green"
              />
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Revenue won
              <p className="text-lg font-extrabold text-slate-900">
                {fmtINR(s.monthRevenue)}
              </p>
            </div>
          </div>
        </div>
      )}

      {incentive.data &&
        (incentive.data.lines?.length > 0 || incentive.data.total > 0) && (
          <div className="card overflow-hidden border-amber-200">
            <button
              className="flex w-full items-center gap-4 p-5 text-left"
              onClick={() => setShowInc((v) => !v)}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <FiAward size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  My incentive this month
                </p>
                <p className="text-2xl font-extrabold text-emerald-700">
                  {fmtINR(incentive.data.total)}
                </p>
                <p className="text-xs text-slate-500">
                  {incentive.data.deals} deals · {fmtINR(incentive.data.amount)}{" "}
                  sold
                  {incentive.data.payout
                    ? ` · Paid ${fmtINR(incentive.data.payout.amount)}`
                    : ""}
                </p>
              </div>
              <span className="text-xs font-semibold text-brand-600">
                {showInc ? "Hide" : "How?"}
              </span>
            </button>
            {showInc && (
              <ul className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                {incentive.data.lines.map((l) => (
                  <li
                    key={l.ruleId}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span>
                      <b>{l.name}</b>
                      <span className="block text-xs text-slate-500">
                        {l.filter} · {l.explain}
                      </span>
                    </span>
                    <span
                      className={`font-bold ${l.earned ? "text-emerald-700" : "text-slate-400"}`}
                    >
                      {fmtINR(l.earned)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

      {dueQ.data?.data?.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 font-bold text-amber-700">
            <FiClock /> Follow-ups due
          </div>
          <ul className="divide-y divide-slate-100">
            {dueQ.data.data.map((v) => (
              <li key={v.id}>
                <button
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                  onClick={() => setSelected(v)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{v.companyName}</p>
                    <p className="text-xs text-slate-500">
                      {v.phone} · due {fmtDate(v.nextFollowUp)}
                    </p>
                  </div>
                  <StatusBadge status={v.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-bold">Today's visits</h2>
        <VisitsTable
          state={todayVisits}
          onOpen={setSelected}
          onPage={setPage}
          emptyAction={
            activeShift ? (
              <button className="btn-primary" onClick={() => setModal("add")}>
                <FiPlus /> Log your first visit
              </button>
            ) : null
          }
        />
      </div>

      <StartShiftModal
        open={modal === "start"}
        onClose={() => setModal(null)}
        onDone={refreshAll}
      />
      <EndShiftModal
        open={modal === "end"}
        onClose={() => setModal(null)}
        shift={activeShift}
        onDone={refreshAll}
      />
      <RouteModal
        open={modal === "route"}
        onClose={() => setModal(null)}
        shiftId={(activeShift || shift)?.id}
      />
      <VisitFormModal
        open={modal === "add" || !!editing}
        visit={editing}
        onClose={() => (setModal(null), setEditing(null))}
        onSaved={refreshAll}
      />
      <VisitDetailModal
        open={!!selected}
        visit={selected}
        onClose={() => setSelected(null)}
        onUpdated={refreshAll}
        onEdit={(v) => {
          setSelected(null);
          setEditing(v);
        }}
      />
    </div>
  );
}
