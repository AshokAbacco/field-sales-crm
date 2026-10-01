import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { FiLogOut, FiMenu, FiX, FiNavigation } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from './ui.jsx';

export default function Layout({ nav, roleLabel }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const links = (
    <nav className="flex flex-col gap-1">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
              isActive ? 'bg-brand-600 text-white shadow-md shadow-brand-600/20' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          <Icon size={18} /> {label}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
        <FiNavigation size={18} />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-extrabold text-slate-900">Field Sales CRM</p>
        <p className="text-[11px] font-medium text-slate-500">{roleLabel}</p>
      </div>
    </div>
  );

  const userBox = (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
      <Avatar name={user?.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user?.name}</p>
        <p className="truncate text-xs text-slate-500">{user?.email}</p>
      </div>
      <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out">
        <FiLogOut />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r border-slate-200 bg-white p-4 lg:flex">
        {brand}
        <div className="flex-1">{links}</div>
        {userBox}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        {brand}
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          <FiMenu size={20} />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 animate-pop-in flex-col gap-6 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              {brand}
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close menu">
                <FiX size={20} />
              </button>
            </div>
            <div className="flex-1">{links}</div>
            {userBox}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${Math.min(nav.length, 5)}, 1fr)` }}>
        {nav.slice(0, 5).map(({ to, short, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-brand-600' : 'text-slate-500'}`}>
            <Icon size={20} />
            {short || label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
