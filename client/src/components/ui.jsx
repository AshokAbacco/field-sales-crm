import { useState } from 'react';
import { FiAlertTriangle, FiChevronLeft, FiChevronRight, FiDownload, FiInbox, FiLoader } from 'react-icons/fi';
import { BsFiletypeCsv, BsFileEarmarkExcel } from 'react-icons/bs';
import toast from 'react-hot-toast';
import Modal from './Modal.jsx';
import { statusMeta } from '../utils/constants.js';
import { initials } from '../utils/format.js';
import { downloadExport, errMsg } from '../api/client.js';

export const Spinner = ({ className = '' }) => <FiLoader className={`animate-spin ${className}`} />;

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center text-slate-400">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function Field({ label, error, hint, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function StatusBadge({ status }) {
  const m = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${m.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

export function Avatar({ name, size = 'md' }) {
  const s = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm';
  return <div className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 font-bold text-white ${s}`}>{initials(name)}</div>;
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'brand', onClick }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-rose-50 text-rose-600',
    sky: 'bg-sky-50 text-sky-600',
    slate: 'bg-slate-100 text-slate-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={`card flex items-center gap-4 p-4 text-left ${onClick ? 'transition hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
      {Icon && (
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={20} />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-extrabold text-slate-900">{value}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
    </Comp>
  );
}

export function ProgressBar({ value, tone = 'brand' }) {
  const c = { brand: 'bg-brand-600', green: 'bg-emerald-500', amber: 'bg-amber-500' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full transition-all ${c}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', message, action, icon: Icon = FiInbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon size={26} />
      </div>
      <p className="font-semibold text-slate-800">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <FiAlertTriangle className="text-rose-500" size={28} />
      <p className="text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button className="btn-secondary btn-sm" onClick={() => onRetry()}>
          Retry
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.total === 0) return null;
  const { page, totalPages, total, pageSize } = meta;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>
        {from}–{to} of <b className="text-slate-700">{total.toLocaleString('en-IN')}</b>
      </span>
      <div className="flex items-center gap-1">
        <button className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <FiChevronLeft />
        </button>
        <span className="px-2 font-medium text-slate-700">
          {page} / {totalPages}
        </span>
        <button className="icon-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <FiChevronRight />
        </button>
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'red', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={FiAlertTriangle}
      tone={tone}
      size="sm"
      busy={busy}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={tone === 'red' ? 'btn-danger' : 'btn-primary'} onClick={run} disabled={busy}>
            {busy && <Spinner />} {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}

/** CSV / Excel export dropdown */
export function ExportMenu({ type, params, label = 'Export' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const run = async (fmt) => {
    setBusy(fmt);
    const t = toast.loading(`Preparing ${fmt.toUpperCase()}…`);
    try {
      const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null));
      await downloadExport(type, fmt, clean);
      toast.success('Download started', { id: t });
    } catch (e) {
      toast.error(errMsg(e, 'Export failed'), { id: t });
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };
  return (
    <div className="relative">
      <button className="btn-secondary" onClick={() => setOpen((o) => !o)} disabled={!!busy}>
        {busy ? <Spinner /> : <FiDownload />} {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-52 animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <button className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-slate-50" onClick={() => run('csv')}>
              <BsFiletypeCsv className="text-sky-600" size={18} /> Download CSV
            </button>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-slate-50" onClick={() => run('xlsx')}>
              <BsFileEarmarkExcel className="text-emerald-600" size={18} /> Download Excel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function DateRange({ from, to, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input type="date" className="input !py-2" value={from || ''} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} aria-label="From date" />
      <span className="text-slate-400">–</span>
      <input type="date" className="input !py-2" value={to || ''} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} aria-label="To date" />
    </div>
  );
}
