import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { FiLogOut, FiNavigation, FiUser, FiChevronDown } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar } from './ui.jsx';
import Modal from './Modal.jsx';
import { ProfilePanel } from '../pages/Profile.jsx';
import { roleLabel } from '../utils/constants.js';

/** Compact top-bar layout for Admin & Manager – few pages, dense content */
export default function TopLayout({ nav = [] }) {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <FiNavigation size={16} />
            </div>
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-extrabold text-slate-900">Field Sales CRM</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{roleLabel(user?.role)} console</p>
            </div>
          </div>

          {nav.length > 1 && (
            <nav className="flex gap-1 rounded-xl bg-slate-100 p-1">
              {nav.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${isActive ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`
                  }
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{label}</span>
                </NavLink>
              ))}
            </nav>
          )}

          <div className="relative ml-auto">
            <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100" onClick={() => setMenu((m) => !m)}>
              <Avatar name={user?.name} size="sm" />
              <div className="hidden text-left leading-tight md:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-[11px] text-slate-500">{user?.managedTeam?.name || user?.email}</p>
              </div>
              <FiChevronDown className="text-slate-400" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-20 mt-2 w-56 animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-slate-50" onClick={() => (setProfile(true), setMenu(false))}>
                    <FiUser /> My account & password
                  </button>
                  <button className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm font-medium text-rose-600 hover:bg-rose-50" onClick={logout}>
                    <FiLogOut /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <Outlet />
      </main>

      <Modal open={profile} onClose={() => setProfile(false)} title="My Account" icon={FiUser} size="lg">
        <ProfilePanel compact />
      </Modal>
    </div>
  );
}
