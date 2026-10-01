import { useState } from 'react';
import { FiMap, FiTruck } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi.js';
import { PageHeader, StatCard, DateRange } from '../../components/ui.jsx';
import { RouteModal } from '../../components/ShiftModals.jsx';
import ShiftsTable from '../../components/ShiftsTable.jsx';
import { fmtINR, fmtKm, monthStartStr, todayStr } from '../../utils/format.js';

export default function FieldTravel() {
  const [filters, setFilters] = useState({ from: monthStartStr(), to: todayStr(), page: 1 });
  const state = useApi('/shifts', filters);
  const [routeId, setRouteId] = useState(null);
  const t = state.data?.totals;

  return (
    <div>
      <PageHeader
        title="Travel Log"
        subtitle="Your daily shifts, odometer readings and fuel allowance"
        actions={<DateRange from={filters.from} to={filters.to} onChange={(r) => setFilters({ ...r, page: 1 })} />}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Distance" value={t ? fmtKm(t.distanceKm) : '–'} icon={FiTruck} tone="sky" />
        <StatCard label="Allowance" value={t ? fmtINR(t.allowance) : '–'} icon={FiTruck} tone="green" />
        <StatCard label="Shifts" value={state.data?.meta?.total ?? '–'} icon={FiMap} tone="brand" />
      </div>
      <ShiftsTable state={state} onRoute={setRouteId} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
      <RouteModal open={!!routeId} shiftId={routeId} onClose={() => setRouteId(null)} />
    </div>
  );
}
