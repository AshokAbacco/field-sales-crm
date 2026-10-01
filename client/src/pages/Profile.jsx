import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiLock } from 'react-icons/fi';
import { api, errMsg } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Field, PageHeader, Spinner } from '../components/ui.jsx';

export default function Profile() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const mismatch = form.confirm && form.newPassword !== form.confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (mismatch) return;
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success('Password updated');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    ['Email', user.email],
    ['Role', user.role === 'ADMIN' ? 'Administrator' : 'Field Visitor'],
    ['Employee Code', user.employeeCode],
    ['Phone', user.phone],
    ['Team', user.team?.name],
    ['Zone', user.zone?.name],
    ['District / State', [user.district, user.state].filter(Boolean).join(', ')],
    ['Bike', user.bikeName ? `${user.bikeName}${user.bikeMileage ? ` · ${user.bikeMileage} KM/L` : ''}` : null],
  ];

  return (
    <div>
      <PageHeader title="My Account" subtitle="Your profile details and password" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size="lg" />
            <div>
              <p className="text-lg font-bold">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
          </div>
          <dl className="mt-6 divide-y divide-slate-100">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div className="flex items-center gap-2 font-bold">
            <FiLock /> Change password
          </div>
          <Field label="Current password" required>
            <input type="password" className="input" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" />
          </Field>
          <Field label="New password" required hint="At least 8 characters">
            <input type="password" className="input" required minLength={8} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" required error={mismatch ? 'Passwords do not match' : null}>
            <input type="password" className={`input ${mismatch ? 'input-error' : ''}`} required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" />
          </Field>
          <button className="btn-primary" disabled={busy || mismatch}>
            {busy && <Spinner />} Update password
          </button>
        </form>
      </div>
    </div>
  );
}
