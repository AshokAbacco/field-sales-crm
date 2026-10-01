import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi, useDebounced } from '../../hooks/useApi.js';
import { PageHeader, ExportMenu } from '../../components/ui.jsx';
import VisitsTable from '../../components/VisitsTable.jsx';
import VisitFilters from '../../components/VisitFilters.jsx';
import { VisitDetailModal, VisitFormModal } from '../../components/VisitModals.jsx';

export default function AdminVisits() {
  const [sp] = useSearchParams();
  const [filters, setFilters] = useState({ q: '', status: sp.get('status') || '', category: '', userId: sp.get('userId') || '', from: '', to: '', page: 1 });
  const q = useDebounced(filters.q);
  const params = { ...filters, q };
  const state = useApi('/visits', params);
  const reps = useApi('/users/options');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const { page, ...exportParams } = params;

  return (
    <div>
      <PageHeader title="Visits & Deals" subtitle="Every client visit across your field force" actions={<ExportMenu type="visits" params={exportParams} />} />
      <VisitFilters filters={filters} setFilters={setFilters} counts={state.data?.statusCounts} reps={reps.data?.data || []} />
      <VisitsTable state={state} showRep onOpen={setSelected} onPage={(p) => setFilters((f) => ({ ...f, page: p }))} />
      <VisitDetailModal
        open={!!selected}
        visit={selected}
        isAdmin
        onClose={() => setSelected(null)}
        onUpdated={() => state.refetch(true)}
        onEdit={(v) => {
          setSelected(null);
          setEditing(v);
        }}
      />
      <VisitFormModal open={!!editing} visit={editing} onClose={() => setEditing(null)} onSaved={() => state.refetch(true)} />
    </div>
  );
}
