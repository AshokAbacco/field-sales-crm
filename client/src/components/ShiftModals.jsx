import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlayCircle, FiStopCircle, FiMap, FiCamera } from 'react-icons/fi';
import Modal from './Modal.jsx';
import LocationCapture from './LocationCapture.jsx';
import { Field, Spinner, PageLoader, ErrorState, StatusBadge } from './ui.jsx';
import { RouteMap } from './Maps.jsx';
import { api, errMsg, fileUrl } from '../api/client.js';
import { useApi } from '../hooks/useApi.js';
import OdometerPhoto from './OdometerPhoto.jsx';
import { useCurrentLocation } from '../hooks/useGeo.js';
import { fmtDayStr, fmtTime, fmtKm, fmtINR } from '../utils/format.js';

/** Build multipart body: fields + optional odometer photo */
function shiftForm(fields, photo) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v == null ? '' : String(v)));
  if (photo) fd.append('photo', photo, 'odometer.jpg');
  return fd;
}

/** Start / end odometer photo thumbnails (click to open full size) */
export function OdometerPhotos({ shift, size = 'md' }) {
  if (!shift?.startPhotoUrl && !shift?.endPhotoUrl) return null;
  const cls = size === 'sm' ? 'h-9 w-12' : 'h-24 w-32';
  return (
    <div className="flex gap-2">
      {[
        ['Start', shift.startPhotoUrl, shift.startKm],
        ['End', shift.endPhotoUrl, shift.endKm],
      ].map(([k, url, km]) =>
        url ? (
          <a key={k} href={fileUrl(url)} target="_blank" rel="noreferrer" className="group relative block" title={`${k} odometer${km != null ? ` · ${km} KM` : ''}`}>
            <img src={fileUrl(url)} alt={`${k} odometer`} loading="lazy" className={`${cls} rounded-lg border border-slate-200 object-cover group-hover:opacity-90`} />
            {size !== 'sm' && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{k}{km != null ? ` · ${km} KM` : ''}</span>}
          </a>
        ) : null,
      )}
    </div>
  );
}

export function StartShiftModal({ open, onClose, onDone }) {
  const geo = useCurrentLocation();
  const [km, setKm] = useState('');
  const [loc, setLoc] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [photoErr, setPhotoErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const settings = useApi(open ? '/org/settings' : null, null, { enabled: open });
  const photoRequired = settings.data?.requireOdometerPhoto !== false;
  useEffect(() => {
    if (open) (setPhoto(null), setPhotoErr(null));
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!loc) return toast.error('Please allow GPS location to start the shift');
    if (photoRequired && !photo) return setPhotoErr('Take a photo of the odometer');
    setBusy(true);
    try {
      const { data } = await api.post(
        '/shifts/start',
        shiftForm({ startKm: Number(km), lat: loc.coords.lat, lng: loc.coords.lng, address: loc.address || '' }, photo),
        { timeout: 120000 },
      );
      toast.success('Shift started. Have a great day on the field!');
      onDone(data.shift);
      onClose();
      setKm('');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title="Start Day Shift"
      subtitle="Punch in with your bike odometer reading and location"
      icon={FiPlayCircle}
      tone="green"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="start-shift" className="btn-success" disabled={busy || !loc || km === ''}>
            {busy && <Spinner />} Confirm Punch In
          </button>
        </>
      }
    >
      <form id="start-shift" onSubmit={submit} className="space-y-5">
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <span className="text-slate-500">Shift start time:</span> <b>{fmtTime(new Date())}</b>
        </div>
        <Field label="Bike starting odometer" required hint="Check your bike's speedometer reading before riding.">
          <div className="relative">
            <input type="number" inputMode="decimal" min="0" step="0.1" required className="input pr-12 text-lg font-bold" placeholder="e.g. 12450" value={km} onChange={(e) => setKm(e.target.value)} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">KM</span>
          </div>
        </Field>
        <OdometerPhoto value={photo} onChange={(b) => (setPhoto(b), setPhotoErr(null))} required={photoRequired} label="Odometer photo (punch-in)" error={photoErr} />
        {open && <LocationCapture geo={geo} onChange={setLoc} label="Start location" />}
      </form>
    </Modal>
  );
}

export function EndShiftModal({ open, onClose, shift, onDone }) {
  const geo = useCurrentLocation();
  const [km, setKm] = useState('');
  const [loc, setLoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoErr, setPhotoErr] = useState(null);
  const settings = useApi(open ? '/org/settings' : null, null, { enabled: open });
  const photoRequired = settings.data?.requireOdometerPhoto !== false;
  useEffect(() => {
    if (open) (setPhoto(null), setPhotoErr(null));
  }, [open]);
  const delta = km !== '' && shift ? Math.round((Number(km) - shift.startKm) * 10) / 10 : null;
  const invalid = delta != null && delta < 0;

  const submit = async (e) => {
    e.preventDefault();
    if (invalid) return;
    if (photoRequired && !photo) return setPhotoErr('Take a photo of the odometer');
    setBusy(true);
    try {
      const { data } = await api.post(
        `/shifts/${shift.id}/end`,
        shiftForm({ endKm: Number(km), lat: loc?.coords.lat ?? '', lng: loc?.coords.lng ?? '', address: loc?.address || '' }, photo),
        { timeout: 120000 },
      );
      toast.success(`Shift closed · ${fmtKm(data.shift.distanceKm)} · ${fmtINR(data.shift.allowance)} allowance`);
      onDone(data.shift);
      onClose();
      setKm('');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (!shift) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title="End Day Shift"
      subtitle={`Shift of ${fmtDayStr(shift.date)} · started ${fmtTime(shift.startTime)}`}
      icon={FiStopCircle}
      tone="red"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="end-shift" className="btn-danger" disabled={busy || km === '' || invalid}>
            {busy && <Spinner />} Confirm Punch Out
          </button>
        </>
      }
    >
      <form id="end-shift" onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Start odometer</p>
            <p className="text-lg font-bold">{shift.startKm} KM</p>
          </div>
          <div className={`rounded-xl p-3 ${invalid ? 'bg-rose-50' : 'bg-brand-50'}`}>
            <p className="text-xs font-semibold uppercase text-slate-500">Distance today</p>
            <p className={`text-lg font-bold ${invalid ? 'text-rose-600' : 'text-brand-700'}`}>{delta == null ? '—' : `${delta} KM`}</p>
          </div>
        </div>
        <Field label="Bike closing odometer" required error={invalid ? `Must be at least ${shift.startKm} KM` : null}>
          <div className="relative">
            <input type="number" inputMode="decimal" min={shift.startKm} step="0.1" required className={`input pr-12 text-lg font-bold ${invalid ? 'input-error' : ''}`} value={km} onChange={(e) => setKm(e.target.value)} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">KM</span>
          </div>
        </Field>
        <OdometerPhoto value={photo} onChange={(b) => (setPhoto(b), setPhotoErr(null))} required={photoRequired} label="Odometer photo (punch-out)" error={photoErr} />
        {open && <LocationCapture geo={geo} onChange={setLoc} label="Closing location" />}
        <p className="text-xs text-slate-500">Once you punch out, today's route and distance are submitted for reimbursement.</p>
      </form>
    </Modal>
  );
}

export function RouteModal({ open, onClose, shiftId }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const load = () => {
    setState({ loading: true, data: null, error: null });
    api
      .get(`/shifts/${shiftId}/route`)
      .then((r) => setState({ loading: false, data: r.data, error: null }))
      .catch((e) => setState({ loading: false, data: null, error: errMsg(e) }));
  };
  useEffect(() => {
    if (open && shiftId) load();
  }, [open, shiftId]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = state.data?.shift;
  return (
    <Modal open={open} onClose={onClose} size="xl" icon={FiMap} title={s ? `Route trace · ${s.user?.name || ''}` : 'Route trace'} subtitle={s ? fmtDayStr(s.date) : ''}>
      {state.loading ? (
        <PageLoader />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={load} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Shift', `${fmtTime(s.startTime)} – ${s.endTime ? fmtTime(s.endTime) : 'Active'}`],
              ['Odometer', `${s.startKm} → ${s.endKm ?? '…'} KM`],
              ['Distance', s.distanceKm != null ? fmtKm(s.distanceKm) : 'In progress'],
              ['Visits', state.data.visits.length],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-slate-500">{k}</p>
                <p className="text-sm font-bold">{v}</p>
              </div>
            ))}
          </div>
          {(s.startPhotoUrl || s.endPhotoUrl) && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500">
                <FiCamera /> Odometer photos
              </p>
              <OdometerPhotos shift={s} />
            </div>
          )}
          <RouteMap shift={s} pings={state.data.pings} visits={state.data.visits} />
          {state.data.visits.length > 0 && (
            <ol className="space-y-2">
              <li className="flex items-center gap-3 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">S</span>
                <span className="font-semibold">Day start</span>
                <span className="text-slate-500">{fmtTime(s.startTime)}</span>
                <span className="truncate text-slate-400">{s.startAddress}</span>
              </li>
              {state.data.visits.map((v, i) => (
                <li key={v.id} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
                  <span className="font-semibold">{v.companyName}</span>
                  <span className="text-slate-500">{fmtTime(v.visitedAt)}</span>
                  <StatusBadge status={v.status} />
                </li>
              ))}
              {s.endTime && (
                <li className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">E</span>
                  <span className="font-semibold">Day end</span>
                  <span className="text-slate-500">{fmtTime(s.endTime)}</span>
                  <span className="truncate text-slate-400">{s.endAddress}</span>
                </li>
              )}
            </ol>
          )}
        </div>
      )}
    </Modal>
  );
}
