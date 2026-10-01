import { useEffect } from 'react';
import { FiCrosshair, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { Spinner } from './ui.jsx';

/** Shows GPS lock state and lets the user refetch. Calls onChange({coords,address}) when a fix arrives. */
export default function LocationCapture({ geo, onChange, autoStart = true, label = 'Location (GPS)' }) {
  const { capture, coords, address, loading, error } = geo;
  useEffect(() => {
    if (autoStart) capture();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (coords) onChange?.({ coords, address });
  }, [coords, address]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <p className="label">{label}</p>
      <div
        className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm ${
          error ? 'border-rose-200 bg-rose-50' : coords ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
        }`}
      >
        {loading ? (
          <Spinner className="text-brand-600" />
        ) : error ? (
          <FiAlertCircle className="shrink-0 text-rose-600" />
        ) : coords ? (
          <FiCheckCircle className="shrink-0 text-emerald-600" />
        ) : (
          <FiCrosshair className="shrink-0 text-slate-400" />
        )}
        <div className="min-w-0 flex-1">
          {loading ? (
            <p className="text-slate-600">Locking GPS…</p>
          ) : error ? (
            <p className="text-rose-700">{error}</p>
          ) : coords ? (
            <>
              <p className="truncate font-semibold text-emerald-800">{address || `${coords.lat}, ${coords.lng}`}</p>
              <p className="text-xs text-emerald-700">
                {coords.lat}, {coords.lng} · ±{coords.accuracy} m
              </p>
            </>
          ) : (
            <p className="text-slate-500">Location not captured</p>
          )}
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={capture} disabled={loading}>
          <FiCrosshair /> {coords ? 'Refresh' : 'Tag GPS'}
        </button>
      </div>
    </div>
  );
}
