import { useState } from 'react';
import { FiMap, FiPhone, FiRefreshCw, FiNavigation } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader, PageLoader, ErrorState, EmptyState, Avatar } from '../../components/ui.jsx';
import { LiveMap } from '../../components/Maps.jsx';
import { RouteModal } from '../../components/ShiftModals.jsx';
import { fmtTime, timeAgo } from '../../utils/format.js';

export default function LiveTracking() {
  const { data, loading, error, refetch } = useApi('/dashboard/live', null, { interval: 30000 });
  const [focus, setFocus] = useState(null);
  const [routeId, setRouteId] = useState(null);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  const reps = data.data;
  const active = reps.filter((r) => r.status === 'ACTIVE');

  return (
    <div>
      <PageHeader
        title="Live Tracking"
        subtitle={`${active.length} on field now · auto-refreshes every 30s`}
        actions={
          <button className="btn-secondary" onClick={() => refetch()}>
            <FiRefreshCw /> Refresh
          </button>
        }
      />
      {reps.length === 0 ? (
        <div className="card">
          <EmptyState icon={FiNavigation} title="No one has punched in today" message="Field visitors appear here as soon as they start their shift." />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card order-2 max-h-[560px] overflow-y-auto lg:order-1">
            <ul className="divide-y divide-slate-100">
              {reps.map((r) => (
                <li key={r.shiftId}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setFocus(r.shiftId)}
                    onKeyDown={(e) => e.key === 'Enter' && setFocus(r.shiftId)}
                    className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition ${focus === r.shiftId ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                  >
                    <Avatar name={r.user.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold">{r.user.name}</p>
                        <span className={`h-2 w-2 rounded-full ${r.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      </div>
                      <p className="text-xs text-slate-500">
                        {r.status === 'ACTIVE' ? `Since ${fmtTime(r.startTime)}` : `Ended ${fmtTime(r.endTime)}`} · {r.visits} visits
                      </p>
                      <p className="text-xs text-slate-400">Last seen {timeAgo(r.last?.recordedAt)}</p>
                    </div>
                    <div className="flex gap-1">
                      {r.user.phone && (
                        <a className="icon-btn" href={`tel:${r.user.phone}`} onClick={(e) => e.stopPropagation()} title="Call">
                          <FiPhone />
                        </a>
                      )}
                      <button
                        className="icon-btn"
                        title="Route trace"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRouteId(r.shiftId);
                        }}
                      >
                        <FiMap />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card order-1 p-2 lg:order-2 lg:col-span-2">
            <LiveMap reps={reps} focusId={focus} onSelect={setFocus} height={540} />
          </div>
        </div>
      )}
      <RouteModal open={!!routeId} shiftId={routeId} onClose={() => setRouteId(null)} />
    </div>
  );
}
