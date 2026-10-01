import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiUserPlus, FiSearch, FiEdit2, FiTrash2, FiEye, FiUsers, FiShuffle, FiPlus, FiTarget, FiMap, FiSettings, FiBriefcase } from 'react-icons/fi';
import { useApi, useDebounced } from '../../hooks/useApi.js';
import { api, errMsg, fileUrl } from '../../api/client.js';
import Modal from '../../components/Modal.jsx';
import { ExportMenu, PageLoader, ErrorState, EmptyState, Pagination, Avatar, ConfirmDialog, Field, Spinner } from '../../components/ui.jsx';
import { RouteModal } from '../../components/ShiftModals.jsx';
import { EmployeeFormModal, EmployeeDetailModal, ReassignModal } from './EmployeeModals.jsx';
import { ROLES, STATES, SEGMENTS } from '../../utils/constants.js';
import { fmtINR, timeAgo } from '../../utils/format.js';

// ---------- team & target modal ----------
function TeamModal({ open, onClose, team, zones, managers, teams, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      setForm({
        name: team?.name || '',
        managerId: team?.manager?.id || '',
        zoneId: team?.zone?.id || '',
        visitsTarget: team?.visitsTarget ?? 50,
        dealsTarget: team?.dealsTarget ?? 8,
        revenueTarget: team ? Number(team.revenueTarget) : 120000,
      });
  }, [open, team]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const taken = new Set(teams.filter((t) => t.id !== team?.id && t.manager).map((t) => t.manager.id));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      team ? await api.patch(`/org/teams/${team.id}`, form) : await api.post('/org/teams', form);
      toast.success(team ? 'Team updated' : 'Team & target created');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      icon={FiTarget}
      title={team ? `Edit ${team.name}` : 'Set Team Performance Target'}
      subtitle="A team is led by one manager; their field employees are its members"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="team-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />} Save target
          </button>
        </>
      }
    >
      <form id="team-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Team name" required className="sm:col-span-2">
          <input className="input" required minLength={2} value={form.name || ''} onChange={set('name')} placeholder="Alpha Auto Warriors" />
        </Field>
        <Field label="Assign manager">
          <select className="input" value={form.managerId || ''} onChange={set('managerId')}>
            <option value="">No manager</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id} disabled={taken.has(m.id)}>
                {m.name}
                {taken.has(m.id) ? ' (leads another team)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Operating zone">
          <select className="input" value={form.zoneId || ''} onChange={set('zoneId')}>
            <option value="">No zone</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Visits target / month">
          <input type="number" min="0" className="input" value={form.visitsTarget ?? 0} onChange={set('visitsTarget')} />
        </Field>
        <Field label="Deals target / month">
          <input type="number" min="0" className="input" value={form.dealsTarget ?? 0} onChange={set('dealsTarget')} />
        </Field>
        <Field label="Revenue target (₹) / month" className="sm:col-span-2">
          <input type="number" min="0" className="input" value={form.revenueTarget ?? 0} onChange={set('revenueTarget')} />
        </Field>
      </form>
    </Modal>
  );
}

// ---------- zone modal ----------
function ZoneModal({ open, onClose, zone, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm({ name: zone?.name || '', state: zone?.state || 'Karnataka', district: zone?.district || '', focusSegment: zone?.focusSegment || SEGMENTS[0] });
  }, [open, zone]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      zone ? await api.patch(`/org/zones/${zone.id}`, form) : await api.post('/org/zones', form);
      toast.success(zone ? 'Zone updated' : 'Zone created');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      icon={FiMap}
      title={zone ? 'Edit Zone' : 'Add Operational Zone'}
      subtitle="State & district hierarchy for territory allocation"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="zone-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />} Save zone
          </button>
        </>
      }
    >
      <form id="zone-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Zone name" required className="sm:col-span-2">
          <input className="input" required value={form.name || ''} onChange={set('name')} placeholder="North Auto Hub" />
        </Field>
        <Field label="State" required>
          <select className="input" required value={form.state || ''} onChange={set('state')}>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="District" required>
          <input className="input" required value={form.district || ''} onChange={set('district')} placeholder="Bengaluru Urban" />
        </Field>
        <Field label="Focus segment" className="sm:col-span-2">
          <select className="input" value={form.focusSegment || ''} onChange={set('focusSegment')}>
            {SEGMENTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function FuelRate() {
  const { data, refetch } = useApi('/org/settings');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setRate(String(data.fuelRatePerKm));
  }, [data]);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/org/settings', { fuelRatePerKm: Number(rate) });
      toast.success('Fuel rate updated – applies to shifts closed from now on');
      refetch(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="flex items-end gap-2">
      <Field label="Fuel allowance per KM (₹)" className="flex-1">
        <input type="number" min="0" step="0.01" className="input !py-2" value={rate} onChange={(e) => setRate(e.target.value)} />
      </Field>
      <button className="btn-primary !py-2" disabled={busy || rate === '' || Number(rate) === data?.fuelRatePerKm}>
        {busy && <Spinner />} Save
      </button>
    </form>
  );
}

// ---------- page ----------
export default function StaffSetup() {
  const [filters, setFilters] = useState({ q: '', role: '', status: '', managerId: '', page: 1, pageSize: 25 });
  const q = useDebounced(filters.q);
  const staff = useApi('/users', { ...filters, q });
  const teams = useApi('/org/teams');
  const zones = useApi('/org/zones');
  const managers = useApi('/users/options', { role: 'MANAGER' });
  const employees = useApi('/users/options', { role: 'FIELD_VISITOR' });

  const [form, setForm] = useState(null); // { employee?, presetRole? }
  const [detailId, setDetailId] = useState(null);
  const [routeId, setRouteId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [reassign, setReassign] = useState(null); // preselect ids
  const [teamModal, setTeamModal] = useState(null);
  const [zoneModal, setZoneModal] = useState(null);
  const [delOrg, setDelOrg] = useState(null);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const reloadPeople = () => {
    staff.refetch(true);
    managers.refetch(true);
    employees.refetch(true);
    teams.refetch(true);
    zones.refetch(true);
  };
  const rows = staff.data?.data || [];
  const rc = staff.data?.roleCounts || {};
  const teamList = teams.data?.data || [];
  const zoneList = zones.data?.data || [];
  const mgrList = managers.data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Staff & Setup</h1>
          <p className="text-sm text-slate-500">Employee onboarding, credentials, team bifurcation, targets, territory zones and reimbursement</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportMenu type="employees" params={{ role: filters.role, managerId: filters.managerId }} />
          <button className="btn-secondary" onClick={() => setReassign([])}>
            <FiShuffle /> Bifurcate Team
          </button>
          <button className="btn-secondary" onClick={() => setForm({ presetRole: 'MANAGER' })}>
            <FiBriefcase /> Add Manager
          </button>
          <button className="btn-primary" onClick={() => setForm({ presetRole: 'FIELD_VISITOR' })}>
            <FiUserPlus /> Add Employee
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Directory */}
        <section className="card overflow-hidden xl:col-span-2">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="flex flex-wrap gap-1.5">
              {[
                ['', `All (${(rc.ADMIN || 0) + (rc.MANAGER || 0) + (rc.FIELD_VISITOR || 0)})`],
                ['MANAGER', `Managers (${rc.MANAGER || 0})`],
                ['FIELD_VISITOR', `Field employees (${rc.FIELD_VISITOR || 0})`],
                ['ADMIN', `Admins (${rc.ADMIN || 0})`],
              ].map(([v, l]) => (
                <button
                  key={v || 'all'}
                  onClick={() => set({ role: v })}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${filters.role === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="input !py-2 pl-10" placeholder="Search name, email, phone, code, district…" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
              </div>
              <select className="input !w-auto !py-2" value={filters.managerId} onChange={(e) => set({ managerId: e.target.value })}>
                <option value="">Any manager</option>
                <option value="none">Unassigned</option>
                {mgrList.map((m) => (
                  <option key={m.id} value={m.id}>
                    Reports to {m.name}
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
          {staff.loading && !staff.data ? (
            <PageLoader />
          ) : staff.error ? (
            <ErrorState message={staff.error} onRetry={staff.refetch} />
          ) : rows.length === 0 ? (
            <EmptyState icon={FiUsers} title="No staff found" />
          ) : (
            <div className={`scroll-thin overflow-x-auto ${staff.loading ? 'opacity-60' : ''}`}>
              <table className="w-full min-w-[900px]">
                <thead className="bg-slate-50/60">
                  <tr>
                    <th className="th">Employee & login</th>
                    <th className="th">Reporting / team</th>
                    <th className="th">District & zone</th>
                    <th className="th">Bike & mileage</th>
                    <th className="th">DL</th>
                    <th className="th">Last login</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((u) => (
                    <tr key={u.id} className={`hover:bg-slate-50 ${u.isActive ? '' : 'opacity-50'}`}>
                      <td className="td">
                        <button className="flex items-center gap-2.5 text-left" onClick={() => setDetailId(u.id)}>
                          <Avatar name={u.name} size="sm" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                              <span className="truncate hover:text-brand-600">{u.name}</span>
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${ROLES[u.role].cls}`}>{ROLES[u.role].label}</span>
                              {!u.isActive && <span className="text-[10px] text-slate-400">inactive</span>}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">{u.email}</p>
                          </div>
                        </button>
                      </td>
                      <td className="td text-xs">
                        {u.role === 'FIELD_VISITOR' ? (
                          u.manager ? (
                            <span className="font-semibold text-violet-700">{u.manager.name}</span>
                          ) : (
                            <span className="font-semibold text-amber-600">Unassigned</span>
                          )
                        ) : u.role === 'MANAGER' ? (
                          <>
                            <p className="font-semibold">{u.managedTeam?.name || <span className="text-amber-600">No team</span>}</p>
                            <p className="text-slate-500">{u._count.reports} reps</p>
                          </>
                        ) : (
                          <span className="text-slate-400">HQ operations</span>
                        )}
                      </td>
                      <td className="td text-xs">
                        <p>{[u.district, u.state].filter(Boolean).join(', ') || '—'}</p>
                        <p className="text-slate-500">{u.zone?.name || ''}</p>
                      </td>
                      <td className="td text-xs">{u.role === 'FIELD_VISITOR' ? `${u.bikeName || '—'}${u.bikeMileage ? ` · ${u.bikeMileage} KM/L` : ''}` : '—'}</td>
                      <td className="td">
                        {u.dlPhotoUrl ? (
                          <a href={fileUrl(u.dlPhotoUrl)} target="_blank" rel="noreferrer" title={u.dlNumber || 'DL photo'}>
                            <img src={fileUrl(u.dlPhotoUrl)} alt="DL" className="h-8 w-12 rounded border object-cover" />
                          </a>
                        ) : u.role === 'FIELD_VISITOR' ? (
                          <span className="text-[11px] font-semibold text-amber-600">Missing</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="td text-xs text-slate-500">{timeAgo(u.lastLoginAt)}</td>
                      <td className="td">
                        <div className="flex justify-end gap-0.5">
                          <button className="icon-btn" title="Dossier" onClick={() => setDetailId(u.id)}>
                            <FiEye />
                          </button>
                          <button className="icon-btn" title="Edit" onClick={() => setForm({ employee: u })}>
                            <FiEdit2 />
                          </button>
                          {u.role === 'FIELD_VISITOR' && (
                            <button className="icon-btn" title="Reassign" onClick={() => setReassign([u.id])}>
                              <FiShuffle />
                            </button>
                          )}
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
          <Pagination meta={staff.data?.meta} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
        </section>

        {/* Setup column */}
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold">
                <FiTarget className="text-slate-400" /> Teams & monthly targets
              </p>
              <button className="btn-primary btn-sm" onClick={() => setTeamModal({})}>
                <FiPlus /> New
              </button>
            </div>
            {!teamList.length ? (
              <EmptyState title="No teams yet" message="Create a team, assign a manager and set targets." icon={FiTarget} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {teamList.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{t.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {t.manager ? `${t.manager.name} · ${t.manager._count.reports} reps` : <span className="text-amber-600">No manager</span>}
                        {t.zone ? ` · ${t.zone.name}` : ''}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">{t.visitsTarget} visits</span>
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{t.dealsTarget} deals</span>
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{fmtINR(t.revenueTarget)}</span>
                      </div>
                    </div>
                    <button className="icon-btn !h-8 !w-8" onClick={() => setTeamModal({ team: t })} title="Edit">
                      <FiEdit2 size={14} />
                    </button>
                    <button className="icon-btn !h-8 !w-8 hover:!text-rose-600" onClick={() => setDelOrg({ type: 'teams', item: t })} title="Delete">
                      <FiTrash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-bold">
                <FiMap className="text-slate-400" /> Territory zones
              </p>
              <button className="btn-secondary btn-sm" onClick={() => setZoneModal({})}>
                <FiPlus /> Add
              </button>
            </div>
            {!zoneList.length ? (
              <EmptyState title="No zones yet" icon={FiMap} />
            ) : (
              <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {zoneList.map((z) => (
                  <div key={z.id} className="group rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-700">{z.state}</span>
                      <span className="flex gap-0.5 opacity-60 group-hover:opacity-100">
                        <button className="icon-btn !h-6 !w-6" onClick={() => setZoneModal({ zone: z })} title="Edit">
                          <FiEdit2 size={12} />
                        </button>
                        <button className="icon-btn !h-6 !w-6 hover:!text-rose-600" onClick={() => setDelOrg({ type: 'zones', item: z })} title="Delete">
                          <FiTrash2 size={12} />
                        </button>
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-bold">{z.name}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {z.district} · {z.focusSegment || 'Multi-segment'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {z._count.users} staff · {z._count.teams} teams
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold">
              <FiSettings className="text-slate-400" /> Travel reimbursement
            </p>
            <FuelRate />
            <p className="mt-2 text-[11px] text-slate-500">Allowance = KM driven × rate, calculated when an employee punches out.</p>
          </section>
        </div>
      </div>

      <EmployeeFormModal
        open={!!form}
        employee={form?.employee}
        presetRole={form?.presetRole}
        managers={mgrList}
        zones={zoneList}
        onClose={() => setForm(null)}
        onSaved={reloadPeople}
      />
      <EmployeeDetailModal
        open={!!detailId}
        employeeId={detailId}
        onClose={() => setDetailId(null)}
        onRoute={(id) => (setDetailId(null), setRouteId(id))}
        onEdit={(u) => (setDetailId(null), setForm({ employee: u }))}
      />
      <RouteModal open={!!routeId} shiftId={routeId} onClose={() => setRouteId(null)} />
      <ReassignModal
        open={!!reassign}
        preselect={reassign || []}
        employees={employees.data?.data || []}
        managers={mgrList}
        zones={zoneList}
        onClose={() => setReassign(null)}
        onSaved={reloadPeople}
      />
      <TeamModal open={!!teamModal} team={teamModal?.team} zones={zoneList} managers={mgrList} teams={teamList} onClose={() => setTeamModal(null)} onSaved={reloadPeople} />
      <ZoneModal open={!!zoneModal} zone={zoneModal?.zone} onClose={() => setZoneModal(null)} onSaved={() => zones.refetch(true)} />
      <ConfirmDialog
        open={!!toDelete}
        title={`Delete ${toDelete?.name}?`}
        message="They will lose access. If they have visits or employees reporting to them, the account is deactivated instead so history and reports stay intact."
        confirmLabel="Delete"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          const { data } = await api.delete(`/users/${toDelete.id}`);
          toast.success(data.deactivated ? 'Account deactivated (history preserved)' : 'Account deleted');
          reloadPeople();
        }}
      />
      <ConfirmDialog
        open={!!delOrg}
        title={`Delete ${delOrg?.item?.name}?`}
        message={delOrg?.type === 'teams' ? 'The manager and employees stay; only the team and its targets are removed.' : 'Staff and teams in this zone will be unassigned from it.'}
        confirmLabel="Delete"
        onClose={() => setDelOrg(null)}
        onConfirm={async () => {
          await api.delete(`/org/${delOrg.type}/${delOrg.item.id}`);
          toast.success('Deleted');
          teams.refetch(true);
          zones.refetch(true);
        }}
      />
    </div>
  );
}
