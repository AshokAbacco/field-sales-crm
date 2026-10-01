import { useState } from 'react';
import { FiMap, FiTruck, FiDollarSign } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader, StatCard, DateRange, ExportMenu } from '../../components/ui.jsx';
import { RouteModal } from '../../components/ShiftModals.jsx';
import ShiftsTable from '../../components/ShiftsTable.jsx';
import { fmtINR, fmtKm, monthStartStr, todayStr } from '../../utils/format.js';

export default function Travel() {
  const [filters, setFilters] = useState({ from: monthStartStr(), to: todayStr(), userId: '', status: '', page: 1 });
  const state = useApi('/shifts', filters);
  const reps = useApi('/users/options');
  const settings = useApi('/org/settings');
  const [routeId, setRouteId] = useState(null);
  const t = state.data?.totals;
  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <div>
      <PageHeader
        title="Travel & Reimbursement"
        subtitle={`Daily odometer audit and fuel allowance${settings.data ? ` @ ₹${settings.data.fuelRatePerKm}/KM` : ''}`}
        actions={<ExportMenu type="shifts" params={{ from: filters.from, to: filters.to, userId: filters.userId }} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRange from={filters.from} to={filters.to} onChange={set} />
        <select className="input !w-auto !py-2" value={filters.userId} onChange={(e) => set({ userId: e.target.value })}>
          <option value="">All field visitors</option>
          {(reps.data?.data || []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select className="input !w-auto !py-2" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All shifts</option>
          <option value="ACTIVE">On field (active)</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total distance" value={t ? fmtKm(t.distanceKm) : '–'} icon={FiTruck} tone="sky" />
        <StatCard label="Total allowance" value={t ? fmtINR(t.allowance) : '–'} icon={FiDollarSign} tone="green" />
        <StatCard label="Shifts" value={state.data?.meta?.total ?? '–'} icon={FiMap} tone="brand" />
      </div>
      <ShiftsTable state={state} showRep onRoute={setRouteId} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
      <RouteModal open={!!routeId} shiftId={routeId} onClose={() => setRouteId(null)} />
    </div>
  );
}
