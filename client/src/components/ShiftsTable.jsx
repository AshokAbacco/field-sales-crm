import { FiMap, FiTruck } from 'react-icons/fi';
import { EmptyState, PageLoader, ErrorState, Pagination } from './ui.jsx';
import { fmtDayStr, fmtTime, fmtINR } from '../utils/format.js';

export default function ShiftsTable({ state, showRep = false, onRoute, onPage }) {
  const { data, loading, error, refetch } = state;
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  const rows = data?.data || [];
  return (
    <div className={`card overflow-hidden ${loading ? 'opacity-60' : ''}`}>
      {rows.length === 0 ? (
        <EmptyState title="No shifts in this period" icon={FiTruck} />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <th className="th">Date</th>
                {showRep && <th className="th">Field Visitor</th>}
                <th className="th">Start (time / KM)</th>
                <th className="th">End (time / KM)</th>
                <th className="th">Distance</th>
                <th className="th">Allowance</th>
                <th className="th">Visits</th>
                <th className="th text-right">Route</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="td font-semibold">{fmtDayStr(s.date)}</td>
                  {showRep && (
                    <td className="td">
                      <p className="font-medium">{s.user?.name}</p>
                      <p className="text-xs text-slate-500">{s.user?.bikeName || ''}</p>
                    </td>
                  )}
                  <td className="td">
                    <p>{fmtTime(s.startTime)}</p>
                    <p className="text-xs text-slate-500">{s.startKm} KM</p>
                  </td>
                  <td className="td">
                    {s.status === 'ACTIVE' ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">On field</span>
                    ) : (
                      <>
                        <p>{fmtTime(s.endTime)}</p>
                        <p className="text-xs text-slate-500">{s.endKm} KM</p>
                      </>
                    )}
                  </td>
                  <td className="td font-bold">{s.distanceKm != null ? `${s.distanceKm} KM` : '—'}</td>
                  <td className="td font-semibold text-emerald-700">{s.allowance != null ? fmtINR(s.allowance) : '—'}</td>
                  <td className="td">{s._count?.visits ?? 0}</td>
                  <td className="td text-right">
                    <button className="btn-secondary btn-sm" onClick={() => onRoute(s.id)}>
                      <FiMap /> Trace
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={data?.meta} onPage={onPage} />
    </div>
  );
}
