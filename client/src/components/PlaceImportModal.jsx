import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiUploadCloud, FiDownload, FiFileText, FiCheckCircle, FiArrowLeft } from 'react-icons/fi';
import Modal from './Modal.jsx';
import { Spinner } from './ui.jsx';
import { api, errMsg, downloadFile } from '../api/client.js';

/** Bulk upload of places (hotels, garages, schools…) from Excel / CSV with a checked preview */
export default function PlaceImportModal({ open, onClose, onImported }) {
  const ref = useRef();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) (setFile(null), setPreview(null), setResult(null));
  }, [open]);

  const send = async (dryRun) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('dryRun', String(dryRun));
    return (await api.post('/places/import', fd, { timeout: 300000 })).data;
  };
  const run = async (dryRun) => {
    setBusy(true);
    try {
      const r = await send(dryRun);
      if (dryRun) setPreview(r);
      else {
        setResult(r.summary);
        toast.success(`${r.summary.created} places added`);
        onImported?.();
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const pick = (f) => {
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) return toast.error('Use a .csv or .xlsx file');
    setFile(f);
    setPreview(null);
  };
  const s = preview?.summary;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size={preview && !result ? 'xl' : 'lg'}
      icon={FiUploadCloud}
      tone="green"
      title="Import Places"
      subtitle="Add hotels, restaurants, garages, schools… in bulk so employees can find them by area"
      footer={
        result ? (
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        ) : preview ? (
          <>
            <button className="btn-ghost mr-auto" onClick={() => setPreview(null)} disabled={busy}>
              <FiArrowLeft /> Change file
            </button>
            <button className="btn-primary" onClick={() => run(false)} disabled={busy || !s.toImport}>
              {busy && <Spinner />} Import {s.toImport} place{s.toImport === 1 ? '' : 's'}
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => run(true)} disabled={busy || !file}>
              {busy && <Spinner />} Check file
            </button>
          </>
        )
      }
    >
      {result ? (
        <div className="py-6 text-center">
          <FiCheckCircle className="mx-auto text-emerald-500" size={44} />
          <p className="mt-3 text-lg font-bold">{result.created} places added</p>
          <p className="mt-1 text-sm text-slate-500">
            {result.areas} area{result.areas === 1 ? '' : 's'}
            {result.duplicates ? ` · ${result.duplicates} duplicates skipped` : ''}
            {result.invalid ? ` · ${result.invalid} rows with errors` : ''}. Existing visits with the same phone were linked automatically.
          </p>
        </div>
      ) : preview ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Rows', s.total, ''],
              ['New places', s.toImport, 'text-emerald-700'],
              ['Duplicates', s.duplicates, 'text-amber-700'],
              ['Errors', s.invalid, 'text-rose-600'],
            ].map(([k, v, c]) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-bold uppercase text-slate-500">{k}</p>
                <p className={`text-lg font-extrabold ${c}`}>{v}</p>
              </div>
            ))}
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="th !py-2">Row</th>
                  <th className="th !py-2">Name</th>
                  <th className="th !py-2">Area</th>
                  <th className="th !py-2">Category</th>
                  <th className="th !py-2">Phone</th>
                  <th className="th !py-2">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.map((r) => (
                  <tr key={r.row} className={r.errors.length ? 'bg-rose-50/60' : r.duplicate ? 'bg-amber-50/50' : ''}>
                    <td className="td !py-2 text-xs text-slate-400">{r.row}</td>
                    <td className="td !py-2 font-semibold">{r.name || '—'}</td>
                    <td className="td !py-2 text-xs">{r.area || '—'}</td>
                    <td className="td !py-2 text-xs">{r.category}</td>
                    <td className="td !py-2 text-xs">{r.phone || '—'}</td>
                    <td className="td !py-2 text-xs">
                      {r.errors.map((e) => (
                        <p key={e} className="font-semibold text-rose-600">✕ {e}</p>
                      ))}
                      {r.duplicate && <p className="font-semibold text-amber-700">⧉ {r.duplicate} – skipped</p>}
                      {r.warnings.map((w) => (
                        <p key={w} className="text-sky-700">! {w}</p>
                      ))}
                      {!r.errors.length && !r.duplicate && !r.warnings.length && <p className="font-semibold text-emerald-600">✓ OK{r.hasLocation ? ' · 📍' : ''}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length < s.total && <p className="text-xs text-slate-500">Showing the first {preview.rows.length} rows of {s.total}.</p>}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold">1. Download the template</p>
            <p className="mt-1 text-xs text-slate-500">
              Required: Name and Area (e.g. Vidyaranyapura). Optional: category, city, pincode, address, phone, contact person, latitude/longitude, notes. Up to 10,000 rows per file.
            </p>
            <div className="mt-3 flex gap-2">
              <button className="btn-secondary btn-sm" onClick={() => downloadFile('/places/template', { format: 'xlsx' }, 'places-template.xlsx').catch((e) => toast.error(errMsg(e)))}>
                <FiDownload /> Excel template
              </button>
              <button className="btn-secondary btn-sm" onClick={() => downloadFile('/places/template', { format: 'csv' }, 'places-template.csv').catch((e) => toast.error(errMsg(e)))}>
                <FiDownload /> CSV template
              </button>
            </div>
          </div>
          <div>
            <p className="label">2. Upload file</p>
            <button
              type="button"
              onClick={() => ref.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => (e.preventDefault(), pick(e.dataTransfer.files?.[0]))}
              className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-8 text-sm ${
                file ? 'border-emerald-300 bg-emerald-50/50 text-emerald-800' : 'border-slate-300 text-slate-500 hover:border-brand-400 hover:bg-brand-50/40'
              }`}
            >
              {file ? <FiFileText size={26} /> : <FiUploadCloud size={26} />}
              <span className="font-semibold">{file ? file.name : 'Click or drop .xlsx / .csv here'}</span>
            </button>
            <input ref={ref} type="file" accept=".csv,.xlsx" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          <p className="text-xs text-slate-500">Duplicates (same name in the same area, or same phone) are skipped automatically.</p>
        </div>
      )}
    </Modal>
  );
}
