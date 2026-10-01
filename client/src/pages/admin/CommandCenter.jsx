import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiUsers, FiNavigation, FiCheckCircle, FiClock, FiTrendingUp, FiTruck, FiDollarSign, FiActivity, FiMap, FiUser,
  FiPhone, FiRefreshCw, FiUserPlus, FiBell, FiRadio, FiTarget, FiMapPin, FiCalendar,
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi, useDebounced } from '../../hooks/useApi.js';
import { PageLoader, ErrorState, ProgressBar, Avatar, ExportMenu, Spinner, EmptyState } from '../../components/ui.jsx';
import { LiveMap, RouteMap } from '../../components/Maps.jsx';
import { RouteModal } from '../../components/ShiftModals.jsx';
import VisitsTable from '../../components/VisitsTable.jsx';
import VisitFilters from '../../components/VisitFilters.jsx';
import ShiftsTable from '../../components/ShiftsTable.jsx';
import { VisitDetailModal, VisitFormModal } from '../../components/VisitModals.jsx';
import { EmployeeDetailModal, EmployeeFormModal } from './EmployeeModals.jsx';
import { STATUSES } from '../../utils/constants.js';
import { fmtINR, fmtKm, fmtTime, fmtDayStr, pct, todayStr, monthStartStr } from '../../utils/format.js';

// ---------- period presets ----------
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PRESETS = [
  { key: 'today', label: 'Today', range: () => ({ from: todayStr(), to: todayStr() }) },
  { key: '7d', label: '7 days', range: () => ({ from: ymd(new Date(Date.now() - 6 * 864e5)), to: todayStr() }) },
  { key: 'month', label: 'This month', range: () => ({ from: monthStartStr(), to: todayStr() }) },
  {
    key: 'last',
    label: 'Last month',
    range: () => {
      const n = new Date();
      return { from: ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: ymd(new Date(n.getFullYear(), n.getMonth(), 0)) };
    },
  },
  { key: 'year', label: 'This year', range: () => ({ from: `${new Date().getFullYear()}-01-01`, to: todayStr() }) },
];

function Tile({ label, value, sub, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-600 bg-slate-100',
    green: 'text-emerald-600 bg-emerald-50',
    sky: 'text-sky-600 bg-sky-50',
    amber: 'text-amber-600 bg-amber-50',
    brand: 'text-brand-600 bg-brand-50',
    violet: 'text-violet-600 bg-violet-50',
    red: 'text-rose-600 bg-rose-50',
  };
  return (
    <div className="card flex items-center gap-3 px-3.5 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg xl:hidden 2xl:flex ${tones[tone]}`}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="whitespace-nowrap text-lg font-extrabold leading-tight text-slate-900">{value}</p>
        {sub && <p className="truncate text-[11px] text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

const Section = ({ title, icon: Icon, right, children, className = '', bodyClass = 'p-4' }) => (
  <section className={`card flex flex-col overflow-hidden ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
        {Icon && <Icon className="text-slate-400" />} {title}
      </p>
      {right}
    </div>
    <div className={`flex-1 ${bodyClass}`}>{children}</div>
  </section>
);

function DayStatus({ day }) {
  if (day.status === 'ACTIVE')
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
        <span className="relative flex h-2 w-2">
          <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        On field
      </span>
    );
  if (day.status === 'COMPLETED') return <span className="text-[11px] font-semibold text-sky-700">Shift completed</span>;
  return <span className="text-[11px] font-semibold text-rose-600">Not logged in</span>;
}

// ---------- map panel: live positions or a selected route, same card ----------
function MapPanel({ reps, day, managerId, routeShiftId, setRouteShiftId }) {
  const live = useApi('/dashboard/live', managerId ? { managerId } : null, { interval: 30000 });
  const route = useApi(routeShiftId ? `/shifts/${routeShiftId}/route` : null, null, { enabled: !!routeShiftId });
  const [focus, setFocus] = useState(null);
  const withShift = reps.filter((r) => r.day.shiftId);
  const r = route.data;

  return (
    <Section
      title={routeShiftId ? 'Daily travel trace & waypoints' : 'Live GPS fleet'}
      icon={routeShiftId ? FiMap : FiRadio}
      className="lg:col-span-2"
      bodyClass="p-2"
      right={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
            <button className={`rounded-md px-2.5 py-1 ${!routeShiftId ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => setRouteShiftId(null)}>
              Live
            </button>
            <button
              className={`rounded-md px-2.5 py-1 ${routeShiftId ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              onClick={() => withShift[0] && setRouteShiftId(withShift[0].day.shiftId)}
              disabled={!withShift.length}
              title={!withShift.length ? 'Nobody punched in on this day' : ''}
            >
              Route trace
            </button>
          </div>
          {routeShiftId && (
            <select className="input !w-auto !py-1 text-xs" value={routeShiftId} onChange={(e) => setRouteShiftId(e.target.value)}>
              {withShift.map((x) => (
                <option key={x.id} value={x.day.shiftId}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          {!routeShiftId && (
            <button className="icon-btn !h-7 !w-7" onClick={() => live.refetch()} title="Refresh">
              <FiRefreshCw size={14} />
            </button>
          )}
        </div>
      }
    >
      {routeShiftId ? (
        route.loading && !r ? (
          <div className="flex h-[420px] items-center justify-center">
            <Spinner className="h-6 w-6 text-slate-400" />
          </div>
        ) : r ? (
          <>
            <div className="grid grid-cols-2 gap-2 px-2 pb-2 pt-1 sm:grid-cols-4">
              {[
                ['Shift', `${fmtTime(r.shift.startTime)} – ${r.shift.endTime ? fmtTime(r.shift.endTime) : 'Active'}`],
                ['Odometer', `${r.shift.startKm} → ${r.shift.endKm ?? '…'} KM`],
                ['Distance', r.shift.distanceKm != null ? fmtKm(r.shift.distanceKm) : 'In progress'],
                ['Visits', `${r.visits.length} · ${fmtDayStr(r.shift.date)}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-1.5">
                  <p className="text-[10px] font-bold uppercase text-slate-500">{k}</p>
                  <p className="truncate text-xs font-bold">{v}</p>
                </div>
              ))}
            </div>
            <RouteMap shift={r.shift} pings={r.pings} visits={r.visits} height={372} />
          </>
        ) : (
          <ErrorState message={route.error || 'Route unavailable'} />
        )
      ) : live.data?.data?.length ? (
        <LiveMap reps={live.data.data} focusId={focus} onSelect={setFocus} height={420} />
      ) : (
        <div className="flex h-[420px] items-center justify-center">
          <EmptyState icon={FiNavigation} title="Nobody on field right now" message={`Employees appear here as soon as they punch in. Showing day: ${fmtDayStr(day)}.`} />
        </div>
      )}
    </Section>
  );
}

// ---------- page ----------
export default function CommandCenter() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(PRESETS[2].range());
  const [day, setDay] = useState(todayStr());
  const [managerId, setManagerId] = useState('');
  const params = { ...range, date: day, ...(managerId && { managerId }) };
  const ov = useApi('/dashboard/overview', params, { interval: 60000 });
  const managers = useApi(isAdmin ? '/users/options' : null, { role: 'MANAGER' }, { enabled: isAdmin });
  const zones = useApi('/org/zones');

  const [routeShiftId, setRouteShiftId] = useState(null);
  const [routeModal, setRouteModal] = useState(null);
  const [dossier, setDossier] = useState(null);
  const [editEmp, setEditEmp] = useState(null); // {employee} | {} for new
  const [repSort, setRepSort] = useState('deals');

  useEffect(() => setRouteShiftId(null), [day, managerId]);

  if (ov.loading && !ov.data) return <PageLoader />;
  if (ov.error && !ov.data) return <ErrorState message={ov.error} onRetry={ov.refetch} />;
  const d = ov.data;
  const { attendance: a, pipeline: p, fleet } = d;
  const myTeam = d.teamStats[0];
  const sortedReps = [...d.repStats].sort((x, y) => (y[repSort] || 0) - (x[repSort] || 0));
  const exportParams = { from: range.from, to: range.to, ...(managerId && { managerId }) };

  return (
    <div className="space-y-4">
      {/* Header + timeline */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{isAdmin ? 'Operations Command Center' : `Team Command · ${user.managedTeam?.name || 'My Team'}`}</h1>
          <p className="text-sm text-slate-500">
            {isAdmin ? 'Attendance, GPS fleet, pipeline, targets, travel & reimbursements – all teams' : 'Live GPS trace, odometer audit, follow-ups and targets for your field employees'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <select className="input !w-auto !py-2" value={managerId} onChange={(e) => setManagerId(e.target.value)} aria-label="Manager">
              <option value="">All managers</option>
              {(managers.data?.data || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5">
            {PRESETS.map((pr) => (
              <button
                key={pr.key}
                onClick={() => (setPreset(pr.key), setRange(pr.range()))}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${preset === pr.key ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {pr.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input type="date" className="input !w-[140px] !py-1.5 text-xs" value={range.from} max={range.to} onChange={(e) => (setPreset('custom'), setRange((r) => ({ ...r, from: e.target.value })))} aria-label="Period from" />
            <span className="text-slate-400">–</span>
            <input type="date" className="input !w-[140px] !py-1.5 text-xs" value={range.to} min={range.from} onChange={(e) => (setPreset('custom'), setRange((r) => ({ ...r, to: e.target.value })))} aria-label="Period to" />
          </div>
          <ExportMenu type="visits" params={exportParams} label="Export" />
          {!isAdmin && (
            <button className="btn-primary" onClick={() => setEditEmp({})}>
              <FiUserPlus /> Add Employee
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
        <Tile label="Logged in" value={a.loggedIn} sub={`of ${a.activeReps} employees`} icon={FiUsers} tone="brand" />
        <Tile label="On field" value={a.onField} sub="active on bike" icon={FiNavigation} tone="green" />
        <Tile label="Shift ended" value={a.completed} sub="punched out" icon={FiCheckCircle} tone="sky" />
        <Tile label="Not logged in" value={a.pending} sub={fmtDayStr(day)} icon={FiClock} tone="red" />
        <Tile label="Visits" value={p.total} sub={`${d.followUpsDue} follow-ups due`} icon={FiActivity} tone="slate" />
        <Tile label="Deals closed" value={p.DEAL_DONE || 0} sub={`${d.conversion}% conversion`} icon={FiTrendingUp} tone="green" />
        <Tile label="Revenue won" value={fmtINR(d.revenue)} sub="subscriptions" icon={FiDollarSign} tone="violet" />
        <Tile label="Fleet distance" value={fmtKm(fleet.distanceKm)} sub={`${fmtINR(fleet.allowance)} allowance`} icon={FiTruck} tone="amber" />
      </div>

      {/* Map + field force for the selected day */}
      <div className="grid gap-4 lg:grid-cols-3">
        <MapPanel reps={d.repStats} day={day} managerId={managerId} routeShiftId={routeShiftId} setRouteShiftId={setRouteShiftId} />
        <Section
          title="Field force on day"
          icon={FiCalendar}
          bodyClass="p-0"
          right={<input type="date" className="input !w-auto !py-1 text-xs" value={day} max={todayStr()} onChange={(e) => setDay(e.target.value)} aria-label="Attendance day" />}
        >
          <ul className="max-h-[470px] divide-y divide-slate-100 overflow-y-auto">
            {d.repStats.map((r) => (
              <li key={r.id} className={`px-4 py-3 ${routeShiftId && r.day.shiftId === routeShiftId ? 'bg-brand-50/60' : ''} ${r.isActive ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={r.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <button className="block truncate text-left text-sm font-bold hover:text-brand-600" onClick={() => setDossier(r.id)}>
                      {r.name}
                    </button>
                    <DayStatus day={r.day} />
                  </div>
                  <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-100">{r.day.km != null ? `${r.day.km} KM` : r.day.startKm != null ? `${r.day.startKm} start` : '— KM'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between pl-11 text-[11px] text-slate-500">
                  <span>
                    {r.day.startTime ? `In ${fmtTime(r.day.startTime)}` : 'No punch-in'}
                    {r.day.endTime ? ` · Out ${fmtTime(r.day.endTime)}` : ''} · <b className="text-slate-700">{r.day.visits}</b> visits
                    {isAdmin && r.manager ? ` · ${r.manager}` : ''}
                  </span>
                  <span className="flex gap-0.5">
                    {r.phone && (
                      <a className="icon-btn !h-7 !w-7" href={`tel:${r.phone}`} title="Call">
                        <FiPhone size={13} />
                      </a>
                    )}
                    <button className="icon-btn !h-7 !w-7" disabled={!r.day.shiftId} onClick={() => setRouteShiftId(r.day.shiftId)} title="Show route on map">
                      <FiMap size={13} />
                    </button>
                  </span>
                </div>
              </li>
            ))}
            {!d.repStats.length && (
              <EmptyState
                icon={FiUsers}
                title="No field employees"
                message={isAdmin ? 'Add employees from Staff & Setup.' : 'Add your first field employee.'}
                action={
                  isAdmin ? (
                    <Link className="btn-primary btn-sm" to="/admin/staff">
                      Staff & Setup
                    </Link>
                  ) : (
                    <button className="btn-primary btn-sm" onClick={() => setEditEmp({})}>
                      <FiUserPlus /> Add Employee
                    </button>
                  )
                }
              />
            )}
          </ul>
        </Section>
      </div>

      {/* Targets + pipeline */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title={isAdmin ? 'Team targets & achievement' : `Team target · ${myTeam?.name || 'not assigned'}`}
          icon={FiTarget}
          className="lg:col-span-2"
          right={isAdmin && <Link to="/admin/staff" className="text-xs font-semibold text-brand-600 hover:underline">Manage teams</Link>}
        >
          {!d.teamStats.length ? (
            <p className="text-sm text-slate-500">{isAdmin ? 'No teams yet. Create teams and targets under Staff & Setup.' : 'Your admin has not assigned a team target yet.'}</p>
          ) : d.teamStats.length === 1 ? (
            (() => {
              const t = d.teamStats[0];
              return (
                <div>
                  <p className="mb-3 text-xs text-slate-500">
                    {t.manager?.name || 'No manager'} · {t.members} representatives{t.zone ? ` · ${t.zone}` : ''} · {fmtKm(t.km)} driven
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      ['Deals achieved', t.deals, t.dealsTarget, 'green', (x) => x],
                      ['Visits', t.visits, t.visitsTarget, 'brand', (x) => x],
                      ['Subscription revenue', t.revenue, t.revenueTarget, 'amber', fmtINR],
                    ].map(([k, v, target, tone, f]) => (
                      <div key={k} className="rounded-xl border border-slate-200 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k}</p>
                        <p className="mt-1 text-2xl font-extrabold text-slate-900">
                          {f(v)} <span className="text-sm font-semibold text-slate-400">/ {f(target)}</span>
                        </p>
                        <div className="mt-2">
                          <ProgressBar value={pct(v, target)} tone={tone} />
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600">{pct(v, target)}% achieved</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="divide-y divide-slate-100">
              {d.teamStats.map((t) => (
                <div key={t.id} className="grid gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[180px_1fr_1fr_1fr]">
                  <div>
                    <p className="text-sm font-bold">{t.name}</p>
                    <p className="text-xs text-slate-500">
                      {t.manager?.name || 'No manager'} · {t.members} reps{t.zone ? ` · ${t.zone}` : ''}
                    </p>
                  </div>
                  {[
                    ['Deals', t.deals, t.dealsTarget, 'green', (x) => x],
                    ['Visits', t.visits, t.visitsTarget, 'brand', (x) => x],
                    ['Revenue', t.revenue, t.revenueTarget, 'amber', fmtINR],
                  ].map(([k, v, target, tone, f]) => (
                    <div key={k}>
                      <div className="mb-1 flex flex-wrap justify-between gap-x-2 text-[11px] text-slate-500">
                        <span className="font-bold uppercase">{k}</span>
                        <span>
                          <b className="text-slate-800">{f(v)}</b> / {f(target)} · {pct(v, target)}%
                        </span>
                      </div>
                      <ProgressBar value={pct(v, target)} tone={tone} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Targets are monthly; achievement is measured over the selected period ({fmtDayStr(range.from)} – {fmtDayStr(range.to)}).
          </p>
        </Section>

        <Section title="Client pipeline" icon={FiActivity}>
          <div className="space-y-3">
            {STATUSES.map((s) => (
              <div key={s.value}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                    {s.value === 'DEAL_DONE' ? 'Deals done (active clients)' : s.value === 'LEAVE_OUT' ? 'Not interested' : s.label}
                  </span>
                  <span className="font-bold">{p[s.value] || 0}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${s.dot}`} style={{ width: `${pct(p[s.value] || 0, p.total)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Visit → deal</p>
              <p className="text-lg font-extrabold text-brand-700">{d.conversion}%</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Avg KM / rep</p>
              <p className="text-lg font-extrabold">{d.repStats.length ? Math.round(fleet.distanceKm / d.repStats.length) : 0}</p>
            </div>
          </div>
        </Section>
      </div>

      {/* Individual report */}
      <Section
        title="Individual performance report"
        icon={FiUser}
        bodyClass="p-0"
        right={
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Sort by</span>
            <select className="input !w-auto !py-1 text-xs" value={repSort} onChange={(e) => setRepSort(e.target.value)}>
              <option value="deals">Deals</option>
              <option value="visits">Visits</option>
              <option value="revenue">Revenue</option>
              <option value="km">KM driven</option>
              <option value="conversion">Conversion</option>
              <option value="followUps">Follow-ups</option>
            </select>
            <ExportMenu type="shifts" params={exportParams} label="Travel" />
          </div>
        }
      >
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Representative</th>
                {isAdmin && <th className="th">Manager</th>}
                <th className="th">Visits</th>
                <th className="th">Deals</th>
                <th className="th">Follow-up</th>
                <th className="th">Not interested</th>
                <th className="th">Revenue</th>
                <th className="th">KM driven</th>
                <th className="th">Allowance</th>
                <th className="th">Target achieved</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedReps.map((r) => {
                const team = d.teamStats.find((t) => t.manager?.id === r.managerId);
                const share = team && team.members ? Math.ceil(team.dealsTarget / team.members) : 0;
                return (
                  <tr key={r.id} className={`hover:bg-slate-50 ${r.isActive ? '' : 'opacity-50'}`}>
                    <td className="td">
                      <button className="flex items-center gap-2.5 text-left" onClick={() => setDossier(r.id)}>
                        <Avatar name={r.name} size="sm" />
                        <div>
                          <p className="text-sm font-semibold hover:text-brand-600">{r.name}</p>
                          <p className="text-[11px] text-slate-500">{r.zone || r.district || '—'}</p>
                        </div>
                      </button>
                    </td>
                    {isAdmin && <td className="td text-xs">{r.manager || <span className="font-semibold text-amber-600">Unassigned</span>}</td>}
                    <td className="td font-semibold">{r.visits}</td>
                    <td className="td font-bold text-emerald-700">{r.deals}</td>
                    <td className="td text-amber-700">{r.followUps}</td>
                    <td className="td text-rose-600">{r.leaveOut}</td>
                    <td className="td text-xs font-semibold">{fmtINR(r.revenue)}</td>
                    <td className="td text-xs">{r.km}</td>
                    <td className="td text-xs">{fmtINR(r.allowance)}</td>
                    <td className="td w-40">
                      {share ? (
                        <div>
                          <div className="mb-1 flex justify-between text-[11px]">
                            <span>
                              {r.deals}/{share}
                            </span>
                            <span className="font-bold">{pct(r.deals, share)}%</span>
                          </div>
                          <ProgressBar value={pct(r.deals, share)} tone="green" />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{r.conversion}% conv.</span>
                      )}
                    </td>
                    <td className="td text-right">
                      <button className="btn-ghost btn-sm" onClick={() => setDossier(r.id)}>
                        Dossier
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!sortedReps.length && (
                <tr>
                  <td colSpan={11} className="td py-8 text-center text-sm text-slate-500">
                    No field employees in this scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Records range={range} managerId={managerId} reps={d.repStats} isAdmin={isAdmin} onRoute={setRouteModal} onChanged={() => ov.refetch(true)} />

      <RouteModal open={!!routeModal} shiftId={routeModal} onClose={() => setRouteModal(null)} />
      <EmployeeDetailModal
        open={!!dossier}
        employeeId={dossier}
        onClose={() => setDossier(null)}
        onRoute={(id) => (setDossier(null), setRouteModal(id))}
        onEdit={(u) => (setDossier(null), setEditEmp({ employee: u }))}
      />
      <EmployeeFormModal
        open={!!editEmp}
        employee={editEmp?.employee}
        managers={managers.data?.data || []}
        zones={zones.data?.data || []}
        onClose={() => setEditEmp(null)}
        onSaved={() => ov.refetch(true)}
      />
    </div>
  );
}

// ---------- records: visits / follow-ups / travel in one card ----------
function Records({ range, managerId, reps, isAdmin, onRoute, onChanged }) {
  const [tab, setTab] = useState('visits');
  const [filters, setFilters] = useState({ q: '', status: '', category: '', userId: '', from: range.from, to: range.to, page: 1 });
  const [travel, setTravel] = useState({ userId: '', status: '', page: 1 });
  useEffect(() => {
    setFilters((f) => ({ ...f, from: range.from, to: range.to, page: 1 }));
    setTravel((t) => ({ ...t, page: 1 }));
  }, [range.from, range.to]);

  const q = useDebounced(filters.q);
  const scope = managerId ? { managerId } : {};
  const visitParams =
    tab === 'followups'
      ? { ...scope, followUpDue: 'true', userId: filters.userId, page: filters.page, sort: 'nextFollowUp', dir: 'asc' }
      : { ...scope, ...filters, q };
  const visits = useApi(tab === 'travel' ? null : '/visits', visitParams, { enabled: tab !== 'travel' });
  const shifts = useApi(tab === 'travel' ? '/shifts' : null, { ...scope, ...travel, from: range.from, to: range.to }, { enabled: tab === 'travel' });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const repOptions = useMemo(() => reps.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive })), [reps]);
  const refresh = () => {
    visits.refetch(true);
    onChanged();
  };
  // eslint-disable-next-line no-unused-vars
  const { page, ...exportFilters } = { ...scope, ...filters, q };

  const tabs = [
    ['visits', 'Client visits & deals', FiMapPin],
    ['followups', 'Follow-ups due', FiBell],
    ['travel', 'Travel, KM & reimbursement', FiTruck],
  ];

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {tabs.map(([k, l, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Icon size={14} /> {l}
            </button>
          ))}
        </div>
        {tab === 'travel' ? (
          <ExportMenu type="shifts" params={{ ...scope, from: range.from, to: range.to, userId: travel.userId }} />
        ) : (
          <ExportMenu type="visits" params={tab === 'followups' ? { ...scope, followUpDue: 'true', userId: filters.userId } : exportFilters} />
        )}
      </div>
      <div className="p-4">
        {tab === 'visits' && (
          <>
            <VisitFilters filters={filters} setFilters={setFilters} counts={visits.data?.statusCounts} reps={repOptions} />
            <VisitsTable state={visits} showRep onOpen={setSelected} onPage={(pg) => setFilters((f) => ({ ...f, page: pg }))} />
          </>
        )}
        {tab === 'followups' && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select className="input !w-auto !py-2" value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value, page: 1 }))}>
                <option value="">All representatives</option>
                {repOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">Follow-ups due today or overdue. Open one to add guidance for the representative.</p>
            </div>
            <VisitsTable state={visits} showRep onOpen={setSelected} onPage={(pg) => setFilters((f) => ({ ...f, page: pg }))} />
          </>
        )}
        {tab === 'travel' && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select className="input !w-auto !py-2" value={travel.userId} onChange={(e) => setTravel((t) => ({ ...t, userId: e.target.value, page: 1 }))}>
                <option value="">All representatives</option>
                {repOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select className="input !w-auto !py-2" value={travel.status} onChange={(e) => setTravel((t) => ({ ...t, status: e.target.value, page: 1 }))}>
                <option value="">All shifts</option>
                <option value="ACTIVE">On field (active)</option>
                <option value="COMPLETED">Completed</option>
              </select>
              {shifts.data?.totals && (
                <p className="ml-auto text-sm text-slate-600">
                  Total <b>{fmtKm(shifts.data.totals.distanceKm)}</b> · Allowance <b className="text-emerald-700">{fmtINR(shifts.data.totals.allowance)}</b>
                </p>
              )}
            </div>
            <ShiftsTable state={shifts} showRep onRoute={onRoute} onPage={(pg) => setTravel((t) => ({ ...t, page: pg }))} />
          </>
        )}
      </div>

      <VisitDetailModal
        open={!!selected}
        visit={selected}
        isAdmin
        onClose={() => setSelected(null)}
        onUpdated={refresh}
        onEdit={isAdmin ? (v) => (setSelected(null), setEditing(v)) : undefined}
      />
      <VisitFormModal open={!!editing} visit={editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </section>
  );
}

