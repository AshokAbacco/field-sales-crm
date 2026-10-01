import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiUsers, FiNavigation, FiCheckCircle, FiClock, FiTrendingUp, FiTruck, FiXCircle, FiDollarSign, FiActivity } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader, StatCard, PageLoader, ErrorState, ProgressBar, DateRange, StatusBadge, Avatar, ExportMenu } from '../../components/ui.jsx';
import { STATUSES } from '../../utils/constants.js';
import { fmtINR, fmtKm, pct, monthStartStr, todayStr, timeAgo } from '../../utils/format.js';

export default function AdminDashboard() {
  const [range, setRange] = useState({ from: monthStartStr(), to: todayStr() });
  const { data, loading, error, refetch } = useApi('/dashboard/admin', range, { interval: 60000 });

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  const { attendance: a, pipeline: p, fleet, revenue, conversion, repStats, teamStats, recent } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Attendance, pipeline, fleet distance and team targets"
        actions={
          <>
            <DateRange from={range.from} to={range.to} onChange={setRange} />
            <ExportMenu type="visits" params={range} label="Export visits" />
          </>
        }
      />

      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Today's attendance</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Active staff" value={a.activeReps} icon={FiUsers} tone="slate" />
          <StatCard label="On field now" value={a.onField} icon={FiNavigation} tone="green" />
          <StatCard label="Shift ended" value={a.completed} icon={FiCheckCircle} tone="sky" />
          <StatCard label="Not punched in" value={a.pending} icon={FiClock} tone="amber" />
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Selected period</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total visits" value={p.total || 0} icon={FiActivity} tone="brand" />
          <StatCard label="Deals closed" value={p.DEAL_DONE || 0} sub={`${conversion}% conversion`} icon={FiTrendingUp} tone="green" />
          <StatCard label="Revenue won" value={fmtINR(revenue)} icon={FiDollarSign} tone="violet" />
          <StatCard label="Fleet distance" value={fmtKm(fleet.distanceKm)} sub={`${fmtINR(fleet.allowance)} allowance`} icon={FiTruck} tone="sky" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <p className="mb-4 font-bold">Pipeline breakdown</p>
          <div className="space-y-4">
            {STATUSES.map((s) => (
              <Link to={`/admin/visits?status=${s.value}`} key={s.value} className="block">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                  <span className="font-bold">{p[s.value] || 0}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${s.dot}`} style={{ width: `${pct(p[s.value] || 0, p.total)}%` }} />
                </div>
              </Link>
            ))}
          </div>
          {!p.total && (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <FiXCircle /> No visits in this period
            </p>
          )}
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-bold">Team targets</p>
            <Link to="/admin/organization" className="text-sm font-semibold text-brand-600 hover:underline">
              Manage
            </Link>
          </div>
          {teamStats.length === 0 ? (
            <p className="text-sm text-slate-500">No teams yet. Create teams and set targets under Teams & Zones.</p>
          ) : (
            <div className="space-y-5">
              {teamStats.map((t) => (
                <div key={t.id}>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      {t.name} <span className="text-xs font-normal text-slate-500">· {t.members} members{t.zone ? ` · ${t.zone}` : ''}</span>
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      ['Visits', t.visits, t.visitsTarget, 'brand', (x) => x],
                      ['Deals', t.deals, t.dealsTarget, 'green', (x) => x],
                      ['Revenue', t.revenue, t.revenueTarget, 'amber', fmtINR],
                    ].map(([k, v, target, tone, f]) => (
                      <div key={k}>
                        <div className="mb-1 flex justify-between text-xs text-slate-500">
                          <span className="font-semibold">{k}</span>
                          <span>
                            {f(v)} / {f(target)}
                          </span>
                        </div>
                        <ProgressBar value={pct(v, target)} tone={tone} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <p className="border-b border-slate-100 px-5 py-4 font-bold">Field visitor performance</p>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="th">Field Visitor</th>
                  <th className="th">Visits</th>
                  <th className="th">Deals</th>
                  <th className="th">Follow-ups</th>
                  <th className="th">Leave out</th>
                  <th className="th">KM</th>
                  <th className="th">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {repStats.map((r) => (
                  <tr key={r.id} className={r.isActive ? '' : 'opacity-50'}>
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} size="sm" />
                        <div>
                          <p className="font-semibold">{r.name}</p>
                          <p className="text-xs text-slate-500">{r.team || r.district || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td font-semibold">{r.visits}</td>
                    <td className="td font-semibold text-emerald-700">{r.deals}</td>
                    <td className="td text-amber-700">{r.followUps}</td>
                    <td className="td text-rose-600">{r.leaveOut}</td>
                    <td className="td">{r.km}</td>
                    <td className="td">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{r.conversion}%</span>
                    </td>
                  </tr>
                ))}
                {!repStats.length && (
                  <tr>
                    <td className="td text-center text-slate-500" colSpan={7}>
                      No field visitors yet. <Link className="font-semibold text-brand-600" to="/admin/employees">Add employees</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card p-5">
          <p className="mb-3 font-bold">Recent activity</p>
          <ul className="space-y-3">
            {recent.map((v) => (
              <li key={v.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{v.companyName}</p>
                  <p className="text-xs text-slate-500">
                    {v.user?.name} · {timeAgo(v.visitedAt)}
                  </p>
                </div>
                <StatusBadge status={v.status} />
              </li>
            ))}
            {!recent.length && <p className="text-sm text-slate-500">No activity yet.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
