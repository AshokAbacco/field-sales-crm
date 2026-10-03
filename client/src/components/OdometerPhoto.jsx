import { useEffect, useRef, useState } from 'react';
import { FiCamera, FiRefreshCw, FiCheckCircle } from 'react-icons/fi';
import { compressImage } from '../utils/image.js';
import { Spinner } from './ui.jsx';

/**
 * Odometer photo capture – opens the rear camera on phones, compresses the picture and shows a preview.
 * onChange(Blob | null)
 */
export default function OdometerPhoto({ value, onChange, required = true, label = 'Odometer photo', error }) {
  const ref = useRef();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value) return setPreview(null);
    const u = URL.createObjectURL(value);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  const pick = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      onChange(await compressImage(file));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div>
      <p className="label">
        {label} {required && <span className="text-rose-500">*</span>}
      </p>
      {preview ? (
        <div className={`flex items-center gap-3 rounded-xl border p-2 ${error ? 'border-rose-300' : 'border-emerald-200 bg-emerald-50/60'}`}>
          <img src={preview} alt="Odometer" className="h-20 w-28 rounded-lg object-cover" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-emerald-800">
              <FiCheckCircle /> Photo ready
            </p>
            <p className="text-xs text-slate-500">{(value.size / 1024).toFixed(0)} KB</p>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => ref.current?.click()}>
            <FiRefreshCw /> Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-sm transition ${
            error ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-300 text-slate-600 hover:border-brand-400 hover:bg-brand-50/40'
          }`}
        >
          {busy ? <Spinner className="h-6 w-6" /> : <FiCamera size={24} />}
          <span className="font-semibold">{busy ? 'Processing…' : 'Take photo of the speedometer reading'}</span>
          <span className="text-xs text-slate-500">Make sure the KM digits are clearly visible</span>
        </button>
      )}
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}
