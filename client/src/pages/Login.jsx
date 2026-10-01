import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiEye, FiEyeOff, FiLock, FiMail, FiNavigation, FiMapPin, FiTrendingUp, FiTruck } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { errMsg } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';
import { homePath } from '../utils/constants.js';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(form.email.trim(), form.password);
      toast.success(`Welcome back, ${u.name.split(' ')[0]}!`);
      nav(homePath(u), { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Unable to sign in'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
            <FiNavigation size={22} />
          </div>
          <span className="text-lg font-extrabold">Field Sales CRM</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Every visit, every kilometre, every deal — in one place.</h1>
          <div className="mt-10 space-y-5">
            {[
              [FiTruck, 'Bike odometer & shift tracking', 'Punch in/out with GPS and auto reimbursement'],
              [FiMapPin, 'GPS-tagged client visits', 'Full route trace on Google Maps'],
              [FiTrendingUp, 'Pipeline & targets', 'Team targets, conversions and CSV / Excel exports'],
            ].map(([Icon, t, d]) => (
              <div key={t} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon />
                </div>
                <div>
                  <p className="font-bold">{t}</p>
                  <p className="text-sm text-white/75">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/60">© {new Date().getFullYear()} Field Sales CRM</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
              <FiNavigation size={22} />
            </div>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Admins, managers and field employees use the same login. You'll be taken to your workspace.</p>

          {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}

          <div className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <div className="relative">
                <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input id="email" type="email" autoComplete="email" required className="input pl-10" placeholder="you@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required className="input px-10" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>
          </div>
          <button className="btn-primary mt-6 w-full py-3" disabled={busy}>
            {busy && <Spinner />} Sign in
          </button>
          <p className="mt-6 text-center text-xs text-slate-500">Forgot your password? Ask your administrator to reset it.</p>
        </form>
      </div>
    </div>
  );
}
