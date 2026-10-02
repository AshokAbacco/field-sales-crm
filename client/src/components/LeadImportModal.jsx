import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiUploadCloud, FiDownload, FiFileText, FiCheckCircle, FiAlertTriangle, FiXCircle, FiCopy, FiArrowLeft } from 'react-icons/fi';
import Modal from './Modal.jsx';
import { Field, Spinner, StatusBadge } from './ui.jsx';
import { api, errMsg, downloadFile } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAssignees } from '../hooks/useAssignees.js';
import { fmtDate, fmtINR } from '../utils/format.js';
import { statusMeta } from '../utils/constants.js';

/**
 * Bulk upload of a manager's existing clients / leads from CSV or Excel.
 * Step 1: choose file + owner → Step 2: preview with row checks → Step 3: import result.
 */
export default function LeadImportModal({ open, onClose, onImported }) {
  const { user } = useAuth();
  const assignees = useAssignees(open);
  const fileRef = useRef();
  const [file, setFile] = useState(null);
  const [assignToId, setAssignToId] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(null);
    setResult(null);
    setFilter('all');
    setSkipDuplicates(true);
    setAssignToId(user.role === 'MANAGER' ? user.id : '');
  }, [open, user]);

  // Re-check the preview when "skip duplicates" changes
  useEffect(() => {
    if (preview && !result) check();
  }, [skipDuplicates]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (dryRun) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('dryRun', String(dryRun));
    fd.append('skipDuplicates', String(skipDuplicates));
    if (assignToId) fd.append('assignToId', assignToId);
    return (await api.post('/leads/import', fd, { timeout: 300000 })).data;
  };

  const check = async () => {
    if (!file) return toast.error('Choose a CSV or Excel file');
    if (!assignToId) return toast.error('Choose who will own these leads');
    setBusy(true);
    try {
      setPreview(await send(true));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const r = await send(false);
      setResult(r.summary);
      toast.success(`${r.summary.created} leads imported`);
      onImported?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const template = async (format) => {
    try {
      await downloadFile('/leads/template', { format }, `lead-import-template.${format}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const pick = (f) => {
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) return toast.error('Use a .csv or .xlsx file');
    if (f.size > 5 * 1024 * 1024) return toast.error('File must be under 5 MB');
    setFile(f);
    setPreview(null);
  };

  const s = preview?.summary;
  const rows = (preview?.rows || []).filter((r) =>
    filter === 'errors' ? r.errors.length : filter === 'warnings' ? r.warnings.length && !r.errors.length : filter === 'duplicates' ? r.duplicate : true,
  );

  const footer = result ? (
    <button className="btn-primary" onClick={onClose}>
      Done
    </button>
  ) : preview ? (
    <>
      <button className="btn-ghost mr-auto" onClick={() => setPreview(null)} disabled={busy}>
        <FiArrowLeft /> Change file
      </button>
      <button className="btn-secondary" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button className="btn-primary" onClick={doImport} disabled={busy || !s.toImport}>
        {busy && <Spinner />} Import {s.toImport} lead{s.toImport === 1 ? '' : 's'}
      </button>
    </>
  ) : (
    <>
      <button className="btn-secondary" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button className="btn-primary" onClick={check} disabled={busy || !file}>
        {busy && <Spinner />} Check file
      </button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size={preview && !result ? 'full' : 'lg'}
      icon={FiUploadCloud}
      tone="green"
      title="Import My Clients / Leads"
      subtitle="Upload existing clients from Excel or CSV, then convert them to follow-ups and deals"
      footer={footer}
    >
      {result ? (
        <div className="py-6 text-center">
          <FiCheckCircle className="mx-auto text-emerald-500" size={44} />
          <p className="mt-3 text-lg font-bold">{result.created} leads imported</p>
          <p className="mt-1 text-sm text-slate-500">
            {result.invalid ? `${result.invalid} rows had errors · ` : ''}
            {result.duplicates ? `${result.duplicates} duplicates ${skipDuplicates ? 'skipped' : 'imported'} · ` : ''}
            They now appear in Client visits &amp; deals (source: Imported).
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {Object.entries(result.byStatus || {}).map(([k, v]) => (
              <span key={k} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusMeta(k).cls}`}>
                {statusMeta(k).label}: {v}
              </span>
            ))}
          </div>
        </div>
      ) : preview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ['all', 'Rows in file', s.total, 'text-slate-900', FiFileText],
              ['all', 'Ready to import', s.toImport, 'text-emerald-700', FiCheckCircle],
              ['errors', 'With errors', s.invalid, 'text-rose-600', FiXCircle],
              ['duplicates', 'Duplicates', s.duplicates, 'text-amber-700', FiCopy],
              ['warnings', 'Warnings', preview.rows.filter((r) => r.warnings.length && !r.errors.length).length, 'text-sky-700', FiAlertTriangle],
            ].map(([f, k, v, c, Icon]) => (
              <button key={k} onClick={() => setFilter(f)} className={`rounded-xl border px-3 py-2 text-left ${filter === f && f !== 'all' ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500">
                  <Icon size={11} /> {k}
                </p>
                <p className={`text-lg font-extrabold ${c}`}>{v}</p>
              </button>
            ))}
          </div>
          {s.duplicates > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-brand-600" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
              Skip duplicates (same phone number already in the CRM or repeated in the file)
            </label>
          )}
          <div className="max-h-[52vh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="th !py-2">Row</th>
                  <th className="th !py-2">Business / phone</th>
                  <th className="th !py-2">Category · software</th>
                  <th className="th !py-2">Status</th>
                  <th className="th !py-2">Deal / follow-up</th>
                  <th className="th !py-2">Owner</th>
                  <th className="th !py-2">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.row} className={r.errors.length ? 'bg-rose-50/60' : r.duplicate ? 'bg-amber-50/50' : ''}>
                    <td className="td !py-2 text-xs text-slate-400">{r.row}</td>
                    <td className="td !py-2">
                      <p className="font-semibold">{r.companyName || '—'}</p>
                      <p className="text-xs text-slate-500">{r.phone || '—'}</p>
                    </td>
                    <td className="td !py-2 text-xs">
                      {r.category} · {r.product}
                    </td>
                    <td className="td !py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="td !py-2 text-xs">
                      {r.status === 'DEAL_DONE' ? `${r.planName || 'Custom'} · ${r.dealValue != null ? fmtINR(r.dealValue) : '—'}` : r.nextFollowUp ? `F/U ${fmtDate(r.nextFollowUp)}` : '—'}
                    </td>
                    <td className="td !py-2 text-xs">{r.assignee}</td>
                    <td className="td !py-2 text-xs">
                      {r.errors.map((e) => (
                        <p key={e} className="font-semibold text-rose-600">✕ {e}</p>
                      ))}
                      {r.duplicate && <p className="font-semibold text-amber-700">⧉ {r.duplicate}</p>}
                      {r.warnings.map((w) => (
                        <p key={w} className="text-sky-700">! {w}</p>
                      ))}
                      {!r.errors.length && !r.duplicate && !r.warnings.length && <p className="font-semibold text-emerald-600">✓ OK</p>}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="td py-6 text-center text-slate-500">
                      Nothing in this filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {preview.rows.length < s.total && <p className="text-xs text-slate-500">Showing the first {preview.rows.length} rows of {s.total}.</p>}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold">1. Download the template and fill in your clients</p>
            <p className="mt-1 text-xs text-slate-500">
              Required: Business Name and Phone. Optional: contact, email, address, category, software, status (Open / Follow-Up / Deal Done / Leave Out), follow-up date, plan, plan
              amount, billing cycle, next payment date, notes, assign-to email. Your own Excel with similar column names also works.
            </p>
            <div className="mt-3 flex gap-2">
              <button className="btn-secondary btn-sm" onClick={() => template('xlsx')}>
                <FiDownload /> Excel template
              </button>
              <button className="btn-secondary btn-sm" onClick={() => template('csv')}>
                <FiDownload /> CSV template
              </button>
            </div>
          </div>
          <div>
            <p className="label">2. Upload file</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pick(e.dataTransfer.files?.[0]);
              }}
              className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-8 text-sm transition ${
                file ? 'border-emerald-300 bg-emerald-50/50 text-emerald-800' : 'border-slate-300 text-slate-500 hover:border-brand-400 hover:bg-brand-50/40'
              }`}
            >
              {file ? <FiFileText size={26} /> : <FiUploadCloud size={26} />}
              <span className="font-semibold">{file ? file.name : 'Click or drop .xlsx / .csv here'}</span>
              <span className="text-xs">{file ? `${(file.size / 1024).toFixed(0)} KB – click to change` : 'Up to 5,000 rows · max 5 MB'}</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="3. Default owner" required hint="Rows with an “Assign To (email)” value go to that person instead">
              <select className="input" value={assignToId} onChange={(e) => setAssignToId(e.target.value)}>
                <option value="">Select owner</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="mt-6 flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 accent-brand-600" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
              <span>
                Skip duplicates
                <span className="block text-xs text-slate-500">Phone already in CRM or repeated in file</span>
              </span>
            </label>
          </div>
          <p className="text-xs text-slate-500">Nothing is saved until you review the preview and click Import.</p>
        </div>
      )}
    </Modal>
  );
}
