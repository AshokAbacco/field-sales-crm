import { FiSearch, FiX } from 'react-icons/fi';
import { CATEGORIES, STATUSES } from '../utils/constants.js';
import { DateRange } from './ui.jsx';

export default function VisitFilters({ filters, setFilters, counts, reps }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const hasAny = filters.q || filters.status || filters.category || filters.userId || filters.from || filters.to;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
  return (
    <div className="mb-4 space-y-3">
      <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ value: '', label: 'All' }, ...STATUSES].map((s) => {
          const active = (filters.status || '') === s.value;
          const n = s.value ? counts?.[s.value] || 0 : total;
          return (
            <button
              key={s.value || 'all'}
              onClick={() => set({ status: s.value })}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s.label}
              {n != null && <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-slate-100'}`}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !py-2 pl-10" placeholder="Search business, contact, phone, address…" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto !py-2" value={filters.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {reps && (
            <select className="input !w-auto !py-2" value={filters.userId} onChange={(e) => set({ userId: e.target.value })} aria-label="Field visitor">
              <option value="">All field visitors</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {!r.isActive ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          )}
          <DateRange from={filters.from} to={filters.to} onChange={(r) => set(r)} />
          {hasAny && (
            <button className="btn-ghost btn-sm" onClick={() => setFilters((f) => ({ ...f, q: '', status: '', category: '', userId: '', from: '', to: '', page: 1 }))}>
              <FiX /> Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
