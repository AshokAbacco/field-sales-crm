import { useState } from "react";
import { useApi, useDebounced } from "../../hooks/useApi.js";
import { PageHeader } from "../../components/ui.jsx";
import VisitsTable from "../../components/VisitsTable.jsx";
import VisitFilters from "../../components/VisitFilters.jsx";
import {
  VisitDetailModal,
  VisitFormModal,
} from "../../components/VisitModals.jsx";

export default function FieldVisits() {
  const [filters, setFilters] = useState({
    q: "",
    status: "",
    categoryId: "",
    productId: "",
    from: "",
    to: "",
    page: 1,
  });
  const q = useDebounced(filters.q);
  const state = useApi("/visits", { ...filters, q });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);

  return (
    <div>
      <PageHeader
        title="My Visits"
        subtitle="All businesses you have visited, with status and follow-ups"
      />
      <VisitFilters
        filters={filters}
        setFilters={setFilters}
        counts={state.data?.statusCounts}
      />
      <VisitsTable
        state={state}
        onOpen={setSelected}
        onPage={(page) => setFilters((f) => ({ ...f, page }))}
      />
      <VisitDetailModal
        open={!!selected}
        visit={selected}
        onClose={() => setSelected(null)}
        onUpdated={() => state.refetch(true)}
        onEdit={(v) => {
          setSelected(null);
          setEditing(v);
        }}
      />
      <VisitFormModal
        open={!!editing}
        visit={editing}
        onClose={() => setEditing(null)}
        onSaved={() => state.refetch(true)}
      />
    </div>
  );
}
