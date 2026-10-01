import { FiChevronRight, FiMapPin } from 'react-icons/fi';
import { StatusBadge, EmptyState, PageLoader, ErrorState, Pagination } from './ui.jsx';
import { categoryLabel } from '../utils/constants.js';
import { fmtDate, fmtDateTime, mapsLink } from '../utils/format.js';

export default function VisitsTable({ state, showRep = false, onOpen, onPage, emptyAction }) {
  const { data, loading, error, refetch } = state;
  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  const rows = data?.data || [];
  const overdue = (v) => v.status === 'FOLLOW_UP' && v.nextFollowUp && new Date(v.nextFollowUp) < new Date(new Date().toDateString());

  return (
    <div className={`card overflow-hidden ${loading ? 'opacity-60' : ''}`}>
      {rows.length === 0 ? (
        <EmptyState title="No visits found" message="Try changing the filters or log a new visit." action={emptyAction} icon={FiMapPin} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="scroll-thin hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className="th">Business</th>
                  {showRep && <th className="th">Representative</th>}
                  <th className="th">Category / Product</th>
                  <th className="th">Location</th>
                  <th className="th">Status</th>
                  <th className="th">Follow-up</th>
                  <th className="th">Visited</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((v) => (
                  <tr key={v.id} className="cursor-pointer transition hover:bg-slate-50" onClick={() => onOpen(v)}>
                    <td className="td">
                      <p className="font-semibold text-slate-900">{v.companyName}</p>
                      <p className="text-xs text-slate-500">
                        {v.contactPerson ? `${v.contactPerson} · ` : ''}
                        {v.phone}
                      </p>
                    </td>
                    {showRep && <td className="td font-medium">{v.user?.name}</td>}
                    <td className="td">
                      <p>{categoryLabel(v.category)}</p>
                      <p className="text-xs text-slate-500">{v.product}</p>
                    </td>
                    <td className="td max-w-[220px]">
                      <p className="truncate text-xs text-slate-600">{v.address}</p>
                      {v.lat != null && (
                        <a href={mapsLink(v.lat, v.lng)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-brand-600 hover:underline">
                          View pin
                        </a>
                      )}
                    </td>
                    <td className="td">
                      <StatusBadge status={v.status} />
                    </td>
                    <td className={`td text-xs ${overdue(v) ? 'font-bold text-rose-600' : 'text-slate-600'}`}>{v.nextFollowUp ? fmtDate(v.nextFollowUp) : '—'}</td>
                    <td className="td text-xs text-slate-600">{fmtDateTime(v.visitedAt)}</td>
                    <td className="td text-slate-400">
                      <FiChevronRight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {rows.map((v) => (
              <li key={v.id}>
                <button className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-slate-50" onClick={() => onOpen(v)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold">{v.companyName}</p>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {categoryLabel(v.category)} · {v.product}
                      {showRep && v.user ? ` · ${v.user.name}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {fmtDateTime(v.visitedAt)}
                      {v.nextFollowUp && <span className={overdue(v) ? 'font-bold text-rose-600' : ''}> · F/U {fmtDate(v.nextFollowUp)}</span>}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pagination meta={data?.meta} onPage={onPage} />
    </div>
  );
}
