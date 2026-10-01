import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiUserPlus, FiEdit2, FiEye, FiEyeOff, FiRefreshCw, FiUpload, FiTrash2, FiUser, FiMapPin, FiTruck, FiMap, FiShuffle } from 'react-icons/fi';
import Modal from '../../components/Modal.jsx';
import { Field, Spinner, StatusBadge, Avatar, PageLoader } from '../../components/ui.jsx';
import { api, errMsg, fileUrl } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { STATES, ROLES, roleLabel } from '../../utils/constants.js';
import { fmtDateTime, fmtDayStr, fmtKm, fmtINR, fmtTime, timeAgo } from '../../utils/format.js';

const EMPTY = {
  name: '', email: '', password: '', role: 'FIELD_VISITOR', phone: '', employeeCode: '', state: 'Karnataka', district: '',
  bikeName: '', bikeMileage: '', dlNumber: '', managerId: '', zoneId: '', isActive: true,
};

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
};

/**
 * Create / edit an account.
 * Admin: any role. Manager: field employees only, always reporting to themselves.
 * `presetRole` opens the form directly as "Add Manager" / "Add Employee".
 */
export function EmployeeFormModal({ open, onClose, employee, presetRole, managers = [], zones = [], onSaved }) {
  const { user: me } = useAuth();
  const isMgrUser = me?.role === 'MANAGER';
  const isEdit = !!employee;
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [removeDl, setRemoveDl] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFile(null);
    setPreview(null);
    setRemoveDl(false);
    setShowPw(!isEdit);
    setForm(
      employee
        ? { ...EMPTY, ...Object.fromEntries(Object.entries(employee).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])), password: '', isActive: employee.isActive }
        : { ...EMPTY, role: isMgrUser ? 'FIELD_VISITOR' : presetRole || 'FIELD_VISITOR', password: genPassword(), zoneId: isMgrUser ? me.zone?.id || '' : '' },
    );
  }, [open, employee, isEdit, presetRole, isMgrUser, me]);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    setErrors((er) => ({ ...er, [k]: null }));
  };

  const pickFile = (f) => {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return toast.error('Use a JPG, PNG or WebP image');
    if (f.size > 5 * 1024 * 1024) return toast.error('Image must be under 5 MB');
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setRemoveDl(false);
  };

  const isField = form.role === 'FIELD_VISITOR';
  const validate = () => {
    const er = {};
    if (form.name.trim().length < 2) er.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Enter a valid email';
    if (!isEdit && form.password.length < 8) er.password = 'At least 8 characters';
    if (isEdit && form.password && form.password.length < 8) er.password = 'At least 8 characters';
    if (isField && !isMgrUser && !form.managerId) er.managerId = 'Select the reporting manager';
    setErrors(er);
    return !Object.keys(er).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'password' && !v) return;
      if (isMgrUser && ['role', 'managerId', 'isActive'].includes(k)) return;
      if (!isField && ['managerId', 'bikeName', 'bikeMileage', 'dlNumber'].includes(k)) return;
      fd.append(k, typeof v === 'boolean' ? String(v) : v ?? '');
    });
    if (file && isField) fd.append('dlPhoto', file);
    try {
      const { data } = isEdit ? await api.patch(`/users/${employee.id}`, fd, { params: removeDl ? { removeDl: 'true' } : {} }) : await api.post('/users', fd);
      toast.success(isEdit ? 'Account updated' : `${roleLabel(data.user.role)} account created for ${data.user.name}`);
      if (!isEdit || form.password) {
        try {
          await navigator.clipboard.writeText(`Login: ${form.email}\nPassword: ${form.password}`);
          toast('Login details copied to clipboard', { icon: '📋' });
        } catch {
          /* clipboard optional */
        }
      }
      onSaved?.(data.user);
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const inp = (k) => `input ${errors[k] ? 'input-error' : ''}`;
  const existingDl = isEdit && employee.dlPhotoUrl && !removeDl ? fileUrl(employee.dlPhotoUrl) : null;
  const dlImg = preview || existingDl;
  const title = isEdit ? `Edit ${employee.name}` : form.role === 'MANAGER' ? 'Add Sales Manager' : form.role === 'ADMIN' ? 'Add Administrator' : 'Add Field Employee';
  const subtitle = isEdit
    ? employee.email
    : form.role === 'MANAGER'
      ? 'Login credentials, supervisory zone and state / district'
      : form.role === 'ADMIN'
        ? 'Full access to every team, report and setting'
        : isMgrUser
          ? 'The employee will report to you'
          : 'Login, reporting manager, territory, bike & driving licence';

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={isEdit ? FiEdit2 : FiUserPlus}
      tone={form.role === 'MANAGER' ? 'amber' : 'brand'}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="emp-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />} {isEdit ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="emp-form" onSubmit={submit} className="space-y-6" noValidate>
        {!isMgrUser && (
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(ROLES).map(([v, r]) => (
              <button
                type="button"
                key={v}
                onClick={() => setForm((f) => ({ ...f, role: v }))}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${form.role === v ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            <input className={inp('name')} value={form.name} onChange={set('name')} placeholder="Amit Verma" />
          </Field>
          <Field label="Email (login ID)" required error={errors.email}>
            <input type="email" className={inp('email')} value={form.email} onChange={set('email')} placeholder="amit@company.com" autoComplete="off" />
          </Field>
          <Field label={isEdit ? 'Reset password' : 'Password'} required={!isEdit} error={errors.password} hint={isEdit ? 'Leave blank to keep the current password' : 'Auto-generated – share it securely'}>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} className={`${inp('password')} pr-20`} value={form.password} onChange={set('password')} autoComplete="new-password" />
              <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2">
                <button type="button" className="icon-btn !h-8 !w-8" title="Generate" onClick={() => (setForm((f) => ({ ...f, password: genPassword() })), setShowPw(true))}>
                  <FiRefreshCw size={14} />
                </button>
                <button type="button" className="icon-btn !h-8 !w-8" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password">
                  {showPw ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                </button>
              </div>
            </div>
          </Field>
          <Field label="Phone">
            <input type="tel" className="input" value={form.phone} onChange={set('phone')} placeholder="98765 43210" />
          </Field>
          {isField && !isMgrUser && (
            <Field label="Reporting manager" required error={errors.managerId}>
              <select className={inp('managerId')} value={form.managerId} onChange={set('managerId')}>
                <option value="">Select manager</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.zone?.name ? ` · ${m.zone.name}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Employee code">
            <input className="input" value={form.employeeCode} onChange={set('employeeCode')} placeholder="FE-001" />
          </Field>
          {form.role !== 'ADMIN' && (
            <>
              <Field label={form.role === 'MANAGER' ? 'Supervisory zone' : 'Territory zone'}>
                <select className="input" value={form.zoneId} onChange={set('zoneId')}>
                  <option value="">No zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} ({z.district})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="State">
                <select className="input" value={form.state} onChange={set('state')}>
                  <option value="">Select state</option>
                  {STATES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="District">
                <input className="input" value={form.district} onChange={set('district')} placeholder="Bengaluru Urban" />
              </Field>
            </>
          )}
        </section>

        {isField && (
          <section>
            <p className="mb-3 text-sm font-bold text-slate-900">Vehicle & driving licence</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bike model">
                <input className="input" value={form.bikeName} onChange={set('bikeName')} placeholder="Hero Splendor Plus" />
              </Field>
              <Field label="Mileage (KM/L)">
                <input type="number" min="0" step="0.1" className="input" value={form.bikeMileage} onChange={set('bikeMileage')} placeholder="55" />
              </Field>
              <Field label="DL number">
                <input className="input" value={form.dlNumber} onChange={set('dlNumber')} placeholder="KA01 20200012345" />
              </Field>
              <div>
                <p className="label">DL photo</p>
                {dlImg ? (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
                    <a href={dlImg} target="_blank" rel="noreferrer">
                      <img src={dlImg} alt="Driving licence" className="h-14 w-20 rounded-lg object-cover" />
                    </a>
                    <div className="flex-1 truncate text-xs text-slate-600">{file ? file.name : 'Uploaded'}</div>
                    <button type="button" className="icon-btn text-rose-500" onClick={() => (file ? (setFile(null), setPreview(null)) : setRemoveDl(true))} title="Remove">
                      <FiTrash2 />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      pickFile(e.dataTransfer.files?.[0]);
                    }}
                    className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 hover:border-brand-400 hover:bg-brand-50/40"
                  >
                    <FiUpload /> Click or drop image (max 5 MB)
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
              </div>
            </div>
          </section>
        )}

        {isEdit && !isMgrUser && (
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-4">
            <div>
              <p className="font-semibold">Account active</p>
              <p className="text-xs text-slate-500">Inactive users cannot sign in</p>
            </div>
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!!form.isActive} onChange={set('isActive')} />
          </label>
        )}
      </form>
    </Modal>
  );
}

/** Bifurcation: move several employees under a manager / zone */
export function ReassignModal({ open, onClose, employees = [], managers = [], zones = [], preselect = [], onSaved }) {
  const [sel, setSel] = useState([]);
  const [managerId, setManagerId] = useState('');
  const [zoneId, setZoneId] = useState('keep');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setSel(preselect);
      setManagerId('');
      setZoneId('keep');
      setQ('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = employees.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = async () => {
    setBusy(true);
    try {
      const body = { userIds: sel, managerId: managerId || null, ...(zoneId !== 'keep' && { zoneId: zoneId || null }) };
      const { data } = await api.post('/users/reassign', body);
      toast.success(`${data.updated} employee(s) reassigned`);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const mgrName = (id) => managers.find((m) => m.id === id)?.name || 'Unassigned';

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={FiShuffle}
      title="Bifurcate / Reassign Team"
      subtitle="Move field employees under another manager and territory"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy || !sel.length || !managerId}>
            {busy && <Spinner />} Apply to {sel.length || 0}
          </button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="label">Field employees ({sel.length} selected)</p>
          <input className="input mb-2 !py-2" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 p-1.5">
            {list.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="accent-brand-600" checked={sel.includes(e.id)} onChange={() => toggle(e.id)} />
                <span className="flex-1 truncate font-medium">{e.name}</span>
                <span className="truncate text-xs text-slate-400">{mgrName(e.managerId)}</span>
              </label>
            ))}
            {!list.length && <p className="p-2 text-sm text-slate-500">No employees</p>}
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Assign to manager" required>
            <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">Select manager</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Territory zone">
            <select className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="keep">Keep current zone</option>
              <option value="">No zone</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.district})
                </option>
              ))}
            </select>
          </Field>
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Past visits and travel stay with the employee. Team targets and reports follow the new manager from now on.</p>
        </div>
      </div>
    </Modal>
  );
}

/** Representative dossier – full individual report in one modal */
export function EmployeeDetailModal({ open, onClose, employeeId, onEdit, onRoute }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!open || !employeeId) return;
    setData(null);
    api
      .get(`/users/${employeeId}`)
      .then((r) => setData(r.data))
      .catch((e) => {
        toast.error(errMsg(e));
        onClose();
      });
  }, [open, employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const u = data?.user;
  const st = data?.stats || {};
  const conv = st.totalVisits ? Math.round(((st.DEAL_DONE || 0) / st.totalVisits) * 100) : 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={FiUser}
      title={u?.name || 'Representative dossier'}
      subtitle={u ? `${roleLabel(u.role)} · ${u.email}` : 'Individual performance & visit audit'}
      footer={
        u &&
        onEdit && (
          <>
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn-primary" onClick={() => onEdit(u)}>
              <FiEdit2 /> Edit
            </button>
          </>
        )
      }
    >
      {!data ? (
        <PageLoader />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={u.name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{u.name}</p>
              <p className="text-sm text-slate-500">{[u.employeeCode, u.phone, u.manager && `Reports to ${u.manager.name}`, u.zone?.name].filter(Boolean).join(' · ') || '—'}</p>
              <p className="text-xs text-slate-400">Last login {timeAgo(u.lastLoginAt)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ['Deals closed', st.DEAL_DONE || 0, 'text-emerald-700'],
              ['Follow-ups', st.FOLLOW_UP || 0, 'text-amber-700'],
              ['Open', st.OPEN || 0, 'text-sky-700'],
              ['Not interested', st.LEAVE_OUT || 0, 'text-rose-600'],
              ['Conversion', `${conv}%`, 'text-brand-700'],
              ['Total visits', st.totalVisits || 0, ''],
              ['Revenue won', fmtINR(st.revenue), ''],
              ['Distance', fmtKm(st.totalKm), ''],
              ['Allowance', fmtINR(st.allowance), ''],
              ['Shifts', st.shifts || 0, ''],
            ].map(([k, v, c]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k}</p>
                <p className={`text-base font-extrabold ${c}`}>{v}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="mb-1.5 flex items-center gap-2 font-bold">
                  <FiTruck /> Vehicle
                </p>
                <p>
                  {u.bikeName || '—'} {u.bikeMileage ? `· ${u.bikeMileage} KM/L` : ''}
                </p>
                <p className="text-slate-500">DL: {u.dlNumber || '—'}</p>
                {u.dlPhotoUrl && (
                  <a href={fileUrl(u.dlPhotoUrl)} target="_blank" rel="noreferrer">
                    <img src={fileUrl(u.dlPhotoUrl)} alt="Driving licence" className="mt-2 h-24 rounded-lg border object-cover" />
                  </a>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="mb-1.5 flex items-center gap-2 font-bold">
                  <FiMapPin /> Territory
                </p>
                <p>{[u.district, u.state].filter(Boolean).join(', ') || '—'}</p>
                <p className="text-slate-500">Zone: {u.zone?.name || '—'}</p>
                <p className="text-slate-500">Manager: {u.manager?.name || '—'}</p>
              </div>
            </div>
            <div className="lg:col-span-2">
              <p className="mb-2 text-sm font-bold">Recent shifts</p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[460px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th !py-2">Date</th>
                      <th className="th !py-2">In / Out</th>
                      <th className="th !py-2">KM</th>
                      <th className="th !py-2">Visits</th>
                      <th className="th !py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentShifts.map((s) => (
                      <tr key={s.id}>
                        <td className="td !py-2 text-xs font-semibold">{fmtDayStr(s.date)}</td>
                        <td className="td !py-2 text-xs">
                          {fmtTime(s.startTime)} – {s.endTime ? fmtTime(s.endTime) : <span className="font-semibold text-emerald-600">on field</span>}
                        </td>
                        <td className="td !py-2 text-xs">{s.distanceKm ?? '—'}</td>
                        <td className="td !py-2 text-xs">{s._count.visits}</td>
                        <td className="td !py-2 text-right">
                          {onRoute && (
                            <button className="btn-ghost btn-sm" onClick={() => onRoute(s.id)}>
                              <FiMap /> Trace
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!data.recentShifts.length && (
                      <tr>
                        <td colSpan={5} className="td text-center text-xs text-slate-500">
                          No shifts yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">Visits logged by this representative</p>
            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[560px]">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="th !py-2">Date</th>
                    <th className="th !py-2">Client</th>
                    <th className="th !py-2">Product</th>
                    <th className="th !py-2">Status</th>
                    <th className="th !py-2">Next action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentVisits.map((v) => (
                    <tr key={v.id}>
                      <td className="td !py-2 text-xs">{fmtDateTime(v.visitedAt)}</td>
                      <td className="td !py-2 text-sm font-medium">{v.companyName}</td>
                      <td className="td !py-2 text-xs">{v.product}</td>
                      <td className="td !py-2">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="td !py-2 text-xs text-slate-600">{v.nextFollowUp ? fmtDayStr(v.nextFollowUp.slice(0, 10)) : v.dealValue ? fmtINR(v.dealValue) : '—'}</td>
                    </tr>
                  ))}
                  {!data.recentVisits.length && (
                    <tr>
                      <td colSpan={5} className="td text-center text-xs text-slate-500">
                        No visits yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
