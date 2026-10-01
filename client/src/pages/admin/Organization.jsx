import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiTarget, FiMap, FiSettings, FiLayers } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi.js';
import { api, errMsg } from '../../api/client.js';
import Modal from '../../components/Modal.jsx';
import { PageHeader, Field, Spinner, PageLoader, EmptyState, ConfirmDialog } from '../../components/ui.jsx';
import { STATES, SEGMENTS } from '../../utils/constants.js';
import { fmtINR } from '../../utils/format.js';

function TeamModal({ open, onClose, team, zones, reps, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      setForm({
        name: team?.name || '',
        zoneId: team?.zone?.id || '',
        visitsTarget: team?.visitsTarget ?? 0,
        dealsTarget: team?.dealsTarget ?? 0,
        revenueTarget: team ? Number(team.revenueTarget) : 0,
        memberIds: team?.members?.map((m) => m.id) || [],
      });
  }, [open, team]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (id) => setForm((f) => ({ ...f, memberIds: f.memberIds.includes(id) ? f.memberIds.filter((x) => x !== id) : [...f.memberIds, id] }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      team ? await api.patch(`/org/teams/${team.id}`, form) : await api.post('/org/teams', form);
      toast.success(team ? 'Team updated' : 'Team created');
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
      size="lg"
      icon={FiTarget}
      title={team ? `Edit ${team.name}` : 'New Team & Targets'}
      subtitle="Monthly targets for visits, deals and subscription revenue"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="team-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />} Save team
          </button>
        </>
      }
    >
      <form id="team-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team name" required>
            <input className="input" required minLength={2} value={form.name || ''} onChange={set('name')} placeholder="Bengaluru North" />
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
        </div>
        <div>
          <p className="label">Members ({form.memberIds?.length || 0})</p>
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
            {reps.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="accent-brand-600" checked={form.memberIds?.includes(r.id) || false} onChange={() => toggle(r.id)} />
                {r.name}
                {!r.isActive && <span className="text-xs text-slate-400">(inactive)</span>}
              </label>
            ))}
            {!reps.length && <p className="p-2 text-sm text-slate-500">No field visitors yet.</p>}
          </div>
          <p className="mt-1 text-xs text-slate-500">An employee belongs to one team; selecting them here moves them from any other team.</p>
        </div>
      </form>
    </Modal>
  );
}

function ZoneModal({ open, onClose, zone, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm({ name: zone?.name || '', state: zone?.state || '', district: zone?.district || '', focusSegment: zone?.focusSegment || SEGMENTS[0] });
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
            <option value="">Select</option>
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

function SettingsCard() {
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
      toast.success('Fuel rate updated. Applies to shifts closed from now on.');
      refetch(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="card p-5">
      <p className="mb-3 flex items-center gap-2 font-bold">
        <FiSettings /> Reimbursement settings
      </p>
      <Field label="Fuel allowance per KM (₹)" hint="Allowance = distance × rate, calculated when a shift is closed.">
        <div className="flex gap-2">
          <input type="number" min="0" step="0.01" className="input" value={rate} onChange={(e) => setRate(e.target.value)} />
          <button className="btn-primary" disabled={busy || rate === ''}>
            {busy && <Spinner />} Save
          </button>
        </div>
      </Field>
    </form>
  );
}

export default function Organization() {
  const teams = useApi('/org/teams');
  const zones = useApi('/org/zones');
  const reps = useApi('/users/options');
  const [teamModal, setTeamModal] = useState({ open: false, team: null });
  const [zoneModal, setZoneModal] = useState({ open: false, zone: null });
  const [del, setDel] = useState(null);

  if (teams.loading && !teams.data) return <PageLoader />;
  const zoneList = zones.data?.data || [];

  return (
    <div className="space-y-6">
      <PageHeader title="Teams & Zones" subtitle="Organise field visitors into teams, assign territories and set monthly targets" />

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <p className="flex items-center gap-2 font-bold">
            <FiLayers /> Teams & targets
          </p>
          <button className="btn-primary btn-sm" onClick={() => setTeamModal({ open: true, team: null })}>
            <FiPlus /> New team
          </button>
        </div>
        {!teams.data?.data?.length ? (
          <EmptyState title="No teams yet" message="Create a team to group field visitors and track targets." icon={FiTarget} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="th">Team</th>
                  <th className="th">Zone</th>
                  <th className="th">Members</th>
                  <th className="th">Visits</th>
                  <th className="th">Deals</th>
                  <th className="th">Revenue</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teams.data.data.map((t) => (
                  <tr key={t.id}>
                    <td className="td font-semibold">{t.name}</td>
                    <td className="td">{t.zone?.name || '—'}</td>
                    <td className="td">
                      <p className="font-medium">{t.members.length}</p>
                      <p className="max-w-[220px] truncate text-xs text-slate-500">{t.members.map((m) => m.name).join(', ')}</p>
                    </td>
                    <td className="td">{t.visitsTarget}</td>
                    <td className="td">{t.dealsTarget}</td>
                    <td className="td">{fmtINR(t.revenueTarget)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button className="icon-btn" onClick={() => setTeamModal({ open: true, team: t })} title="Edit">
                          <FiEdit2 />
                        </button>
                        <button className="icon-btn hover:!text-rose-600" onClick={() => setDel({ type: 'teams', item: t })} title="Delete">
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
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <p className="flex items-center gap-2 font-bold">
              <FiMap /> Territory zones
            </p>
            <button className="btn-secondary btn-sm" onClick={() => setZoneModal({ open: true, zone: null })}>
              <FiPlus /> Add zone
            </button>
          </div>
          {!zoneList.length ? (
            <EmptyState title="No zones yet" icon={FiMap} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {zoneList.map((z) => (
                <li key={z.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-semibold">{z.name}</p>
                    <p className="text-xs text-slate-500">
                      {z.district}, {z.state} · {z.focusSegment || 'General'} · {z._count.users} staff · {z._count.teams} teams
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button className="icon-btn" onClick={() => setZoneModal({ open: true, zone: z })} title="Edit">
                      <FiEdit2 />
                    </button>
                    <button className="icon-btn hover:!text-rose-600" onClick={() => setDel({ type: 'zones', item: z })} title="Delete">
                      <FiTrash2 />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <SettingsCard />
      </div>

      <TeamModal
        open={teamModal.open}
        team={teamModal.team}
        zones={zoneList}
        reps={reps.data?.data || []}
        onClose={() => setTeamModal({ open: false, team: null })}
        onSaved={() => (teams.refetch(true), zones.refetch(true))}
      />
      <ZoneModal open={zoneModal.open} zone={zoneModal.zone} onClose={() => setZoneModal({ open: false, zone: null })} onSaved={() => zones.refetch(true)} />
      <ConfirmDialog
        open={!!del}
        title={`Delete ${del?.item?.name}?`}
        message={del?.type === 'teams' ? 'Members will be unassigned from this team. Their visits and history are kept.' : 'Staff and teams in this zone will be unassigned from it.'}
        confirmLabel="Delete"
        onClose={() => setDel(null)}
        onConfirm={async () => {
          await api.delete(`/org/${del.type}/${del.item.id}`);
          toast.success('Deleted');
          teams.refetch(true);
          zones.refetch(true);
        }}
      />
    </div>
  );
}
