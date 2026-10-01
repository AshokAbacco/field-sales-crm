import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiUserPlus, FiEdit2, FiEye, FiEyeOff, FiRefreshCw, FiUpload, FiTrash2, FiUser, FiMapPin, FiTruck, FiActivity } from 'react-icons/fi';
import Modal from '../../components/Modal.jsx';
import { Field, Spinner, StatusBadge, Avatar, PageLoader } from '../../components/ui.jsx';
import { api, errMsg, fileUrl } from '../../api/client.js';
import { STATES } from '../../utils/constants.js';
import { fmtDateTime, fmtKm, timeAgo } from '../../utils/format.js';

const EMPTY = {
  name: '', email: '', password: '', role: 'FIELD_VISITOR', phone: '', employeeCode: '', state: '', district: '',
  bikeName: '', bikeMileage: '', dlNumber: '', teamId: '', zoneId: '', isActive: true,
};

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
};

export function EmployeeFormModal({ open, onClose, employee, teams, zones, onSaved }) {
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
        : { ...EMPTY, password: genPassword() },
    );
  }, [open, employee, isEdit]);

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

  const validate = () => {
    const er = {};
    if (form.name.trim().length < 2) er.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = 'Enter a valid email';
    if (!isEdit && form.password.length < 8) er.password = 'At least 8 characters';
    if (isEdit && form.password && form.password.length < 8) er.password = 'At least 8 characters';
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
      fd.append(k, typeof v === 'boolean' ? String(v) : v ?? '');
    });
    if (file) fd.append('dlPhoto', file);
    try {
      const { data } = isEdit
        ? await api.patch(`/users/${employee.id}`, fd, { params: removeDl ? { removeDl: 'true' } : {} })
        : await api.post('/users', fd);
      toast.success(isEdit ? 'Employee updated' : `Account created for ${data.user.name}`);
      if (!isEdit || form.password) {
        try {
          await navigator.clipboard.writeText(`Login: ${form.email}\nPassword: ${form.password}`);
          toast('Login details copied to clipboard', { icon: '📋' });
        } catch { /* clipboard optional */ }
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={isEdit ? FiEdit2 : FiUserPlus}
      title={isEdit ? `Edit ${employee.name}` : 'Create Employee Account'}
      subtitle={isEdit ? employee.email : 'The employee signs in with this email and password'}
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
        <section>
          <p className="mb-3 text-sm font-bold text-slate-900">Account</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={errors.name}>
              <input className={inp('name')} value={form.name} onChange={set('name')} placeholder="Amit Verma" />
            </Field>
            <Field label="Email (login ID)" required error={errors.email}>
              <input type="email" className={inp('email')} value={form.email} onChange={set('email')} placeholder="amit@company.com" autoComplete="off" />
            </Field>
            <Field label={isEdit ? 'Reset password' : 'Password'} required={!isEdit} error={errors.password} hint={isEdit ? 'Leave blank to keep current password' : 'Share this with the employee securely'}>
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
            <Field label="Role" required>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['FIELD_VISITOR', 'Field Visitor'],
                  ['ADMIN', 'Admin'],
                ].map(([v, l]) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setForm((f) => ({ ...f, role: v }))}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${form.role === v ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-100' : 'border-slate-200 text-slate-600'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Phone">
              <input type="tel" className="input" value={form.phone} onChange={set('phone')} placeholder="98450 00000" />
            </Field>
            <Field label="Employee code">
              <input className="input" value={form.employeeCode} onChange={set('employeeCode')} placeholder="FV-001" />
            </Field>
          </div>
        </section>

        {form.role === 'FIELD_VISITOR' && (
          <>
            <section>
              <p className="mb-3 text-sm font-bold text-slate-900">Territory</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Team">
                  <select className="input" value={form.teamId} onChange={set('teamId')}>
                    <option value="">No team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Zone">
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
              </div>
            </section>

            <section>
              <p className="mb-3 text-sm font-bold text-slate-900">Vehicle & licence</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Bike model">
                  <input className="input" value={form.bikeName} onChange={set('bikeName')} placeholder="Honda Shine" />
                </Field>
                <Field label="Mileage (KM/L)">
                  <input type="number" min="0" step="0.1" className="input" value={form.bikeMileage} onChange={set('bikeMileage')} placeholder="55" />
                </Field>
                <Field label="Driving licence number">
                  <input className="input" value={form.dlNumber} onChange={set('dlNumber')} placeholder="KA01 20200012345" />
                </Field>
                <div>
                  <p className="label">Driving licence photo</p>
                  {dlImg ? (
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
                      <a href={dlImg} target="_blank" rel="noreferrer">
                        <img src={dlImg} alt="Driving licence" className="h-14 w-20 rounded-lg object-cover" />
                      </a>
                      <div className="flex-1 text-xs text-slate-600">{file ? file.name : 'Uploaded'}</div>
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
          </>
        )}

        {isEdit && (
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 p-4">
            <div>
              <p className="font-semibold">Account active</p>
              <p className="text-xs text-slate-500">Inactive employees cannot sign in</p>
            </div>
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={!!form.isActive} onChange={set('isActive')} />
          </label>
        )}
      </form>
    </Modal>
  );
}

export function EmployeeDetailModal({ open, onClose, employeeId, onEdit }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!open || !employeeId) return;
    setData(null);
    api.get(`/users/${employeeId}`).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  }, [open, employeeId]);

  const u = data?.user;
  const st = data?.stats || {};
  const conv = st.totalVisits ? Math.round(((st.DEAL_DONE || 0) / st.totalVisits) * 100) : 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={FiUser}
      title={u?.name || 'Employee'}
      subtitle={u ? `${u.email} · ${u.role === 'ADMIN' ? 'Admin' : 'Field Visitor'}` : ''}
      footer={
        u && (
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
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={u.name} size="lg" />
            <div className="flex-1">
              <p className="text-lg font-bold">{u.name}</p>
              <p className="text-sm text-slate-500">
                {[u.employeeCode, u.phone, u.team?.name, u.zone?.name].filter(Boolean).join(' · ') || '—'}
              </p>
              <p className="text-xs text-slate-400">Last login {timeAgo(u.lastLoginAt)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Total visits', st.totalVisits || 0, FiActivity],
              ['Deals closed', st.DEAL_DONE || 0, FiActivity],
              ['Conversion', `${conv}%`, FiActivity],
              ['Distance', fmtKm(st.totalKm), FiTruck],
              ['Follow-ups', st.FOLLOW_UP || 0, FiActivity],
              ['Open', st.OPEN || 0, FiActivity],
              ['Leave out', st.LEAVE_OUT || 0, FiActivity],
              ['Shifts', st.shifts || 0, FiTruck],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-500">{k}</p>
                <p className="text-lg font-bold">{v}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4 text-sm">
              <p className="mb-2 flex items-center gap-2 font-bold">
                <FiTruck /> Vehicle
              </p>
              <p>{u.bikeName || '—'} {u.bikeMileage ? `· ${u.bikeMileage} KM/L` : ''}</p>
              <p className="text-slate-500">DL: {u.dlNumber || '—'}</p>
              {u.dlPhotoUrl && (
                <a href={fileUrl(u.dlPhotoUrl)} target="_blank" rel="noreferrer">
                  <img src={fileUrl(u.dlPhotoUrl)} alt="Driving licence" className="mt-2 h-28 rounded-lg border object-cover" />
                </a>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4 text-sm">
              <p className="mb-2 flex items-center gap-2 font-bold">
                <FiMapPin /> Territory
              </p>
              <p>{[u.district, u.state].filter(Boolean).join(', ') || '—'}</p>
              <p className="text-slate-500">Team: {u.team?.name || '—'}</p>
              <p className="text-slate-500">Zone: {u.zone?.name || '—'}</p>
            </div>
          </div>
          <div>
            <p className="mb-2 font-bold">Recent visits</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[520px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Business</th>
                    <th className="th">Product</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentVisits.map((v) => (
                    <tr key={v.id}>
                      <td className="td text-xs">{fmtDateTime(v.visitedAt)}</td>
                      <td className="td font-medium">{v.companyName}</td>
                      <td className="td">{v.product}</td>
                      <td className="td">
                        <StatusBadge status={v.status} />
                      </td>
                    </tr>
                  ))}
                  {!data.recentVisits.length && (
                    <tr>
                      <td colSpan={4} className="td text-center text-slate-500">
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
