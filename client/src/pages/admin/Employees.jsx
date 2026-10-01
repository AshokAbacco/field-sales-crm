import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiUserPlus, FiSearch, FiEdit2, FiTrash2, FiEye, FiUsers } from 'react-icons/fi';
import { useApi, useDebounced } from '../../hooks/useApi.js';
import { api } from '../../api/client.js';
import { PageHeader, ExportMenu, PageLoader, ErrorState, EmptyState, Pagination, Avatar, ConfirmDialog } from '../../components/ui.jsx';
import { EmployeeFormModal, EmployeeDetailModal } from './EmployeeModals.jsx';
import { timeAgo } from '../../utils/format.js';

export default function Employees() {
  const [filters, setFilters] = useState({ q: '', role: '', status: '', teamId: '', page: 1 });
  const q = useDebounced(filters.q);
  const state = useApi('/users', { ...filters, q });
  const teams = useApi('/org/teams');
  const zones = useApi('/org/zones');
  const [form, setForm] = useState({ open: false, employee: null });
  const [detailId, setDetailId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const rows = state.data?.data || [];

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Create and manage accounts for admins and field visitors"
        actions={
          <>
            <ExportMenu type="employees" params={{ role: filters.role }} />
            <button className="btn-primary" onClick={() => setForm({ open: true, employee: null })}>
              <FiUserPlus /> Add Employee
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !py-2 pl-10" placeholder="Search name, email, phone, code, district…" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto !py-2" value={filters.role} onChange={(e) => set({ role: e.target.value })}>
            <option value="">All roles</option>
            <option value="FIELD_VISITOR">Field visitors</option>
            <option value="ADMIN">Admins</option>
          </select>
          <select className="input !w-auto !py-2" value={filters.teamId} onChange={(e) => set({ teamId: e.target.value })}>
            <option value="">All teams</option>
            {(teams.data?.data || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select className="input !w-auto !py-2" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {state.loading && !state.data ? (
        <PageLoader />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={state.refetch} />
      ) : (
        <div className={`card overflow-hidden ${state.loading ? 'opacity-60' : ''}`}>
          {rows.length === 0 ? (
            <EmptyState
              icon={FiUsers}
              title="No employees found"
              action={
                <button className="btn-primary" onClick={() => setForm({ open: true, employee: null })}>
                  <FiUserPlus /> Add Employee
                </button>
              }
            />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="th">Employee</th>
                    <th className="th">Role</th>
                    <th className="th">Team / Zone</th>
                    <th className="th">District</th>
                    <th className="th">Bike</th>
                    <th className="th">Last login</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="td">
                        <button className="flex items-center gap-3 text-left" onClick={() => setDetailId(u.id)}>
                          <Avatar name={u.name} size="sm" />
                          <div>
                            <p className="font-semibold text-slate-900 hover:text-brand-600">{u.name}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </button>
                      </td>
                      <td className="td">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.role === 'ADMIN' ? 'bg-violet-50 text-violet-700' : 'bg-brand-50 text-brand-700'}`}>
                          {u.role === 'ADMIN' ? 'Admin' : 'Field Visitor'}
                        </span>
                      </td>
                      <td className="td text-xs">
                        <p className="font-medium">{u.team?.name || '—'}</p>
                        <p className="text-slate-500">{u.zone?.name || ''}</p>
                      </td>
                      <td className="td text-xs">{[u.district, u.state].filter(Boolean).join(', ') || '—'}</td>
                      <td className="td text-xs">
                        {u.bikeName || '—'}
                        {u.bikeMileage ? <span className="block text-slate-500">{u.bikeMileage} KM/L</span> : null}
                      </td>
                      <td className="td text-xs text-slate-500">{timeAgo(u.lastLoginAt)}</td>
                      <td className="td">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${u.isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                          <span className={`h-2 w-2 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="td">
                        <div className="flex justify-end gap-1">
                          <button className="icon-btn" title="View" onClick={() => setDetailId(u.id)}>
                            <FiEye />
                          </button>
                          <button className="icon-btn" title="Edit" onClick={() => setForm({ open: true, employee: u })}>
                            <FiEdit2 />
                          </button>
                          <button className="icon-btn hover:!text-rose-600" title="Delete" onClick={() => setToDelete(u)}>
                            <FiTrash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination meta={state.data?.meta} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
        </div>
      )}

      <EmployeeFormModal
        open={form.open}
        employee={form.employee}
        teams={teams.data?.data || []}
        zones={zones.data?.data || []}
        onClose={() => setForm({ open: false, employee: null })}
        onSaved={() => state.refetch(true)}
      />
      <EmployeeDetailModal
        open={!!detailId}
        employeeId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(u) => {
          setDetailId(null);
          setForm({ open: true, employee: u });
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete employee?"
        message={`${toDelete?.name} will lose access. If they have visit history, the account is deactivated instead so reports stay intact.`}
        confirmLabel="Delete"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          const { data } = await api.delete(`/users/${toDelete.id}`);
          toast.success(data.deactivated ? 'Employee deactivated (history preserved)' : 'Employee deleted');
          state.refetch(true);
        }}
      />
    </div>
  );
}
