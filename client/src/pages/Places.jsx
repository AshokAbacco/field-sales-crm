import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiSearch, FiPlus, FiUploadCloud, FiMapPin, FiPhone, FiNavigation, FiList, FiMap, FiEdit2, FiTrash2, FiCheckCircle, FiCircle,
  FiCrosshair, FiX, FiDatabase, FiBriefcase,
} from 'react-icons/fi';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi, useDebounced } from '../hooks/useApi.js';
import { useCatalog } from '../hooks/useCatalog.js';
import { api, errMsg } from '../api/client.js';
import Modal from '../components/Modal.jsx';
import { Field, Spinner, PageLoader, ErrorState, EmptyState, Pagination, ConfirmDialog, StatusBadge } from '../components/ui.jsx';
import { PlacesMap, PointMap } from '../components/Maps.jsx';
import PlaceImportModal from '../components/PlaceImportModal.jsx';
import { VisitFormModal } from '../components/VisitModals.jsx';
import { useCurrentLocation } from '../hooks/useGeo.js';
import { fmtDate, fmtINR } from '../utils/format.js';
import { statusMeta } from '../utils/constants.js';

const directionsUrl = (p) =>
  p.lat != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address, p.area, p.city].filter(Boolean).join(', '))}`;

function VisitedBadge({ v, compact }) {
  if (!v)
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
        <FiCircle size={10} /> Not visited
      </span>
    );
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${statusMeta(v.bestStatus).cls}`}>
      <FiCheckCircle size={11} /> {v.byMe ? 'Visited by you' : compact ? 'Visited' : `Visited · ${v.lastBy || 'team'}`}
    </span>
  );
}

// ---------- add / edit ----------
const EMPTY = { name: '', categoryId: '', area: '', city: '', pincode: '', address: '', phone: '', contactPerson: '', lat: '', lng: '', notes: '' };

function PlaceFormModal({ open, onClose, place, areas, onSaved }) {
  const { categories } = useCatalog();
  const geo = useCurrentLocation();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(place ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, place[k] ?? ''])) : EMPTY);
  }, [open, place]);
  useEffect(() => {
    if (geo.coords) setF((x) => ({ ...x, lat: String(geo.coords.lat), lng: String(geo.coords.lng), address: x.address || geo.address || '' }));
  }, [geo.coords]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      place ? await api.patch(`/places/${place.id}`, f) : await api.post('/places', f);
      toast.success(place ? 'Place updated' : 'Place added');
      onSaved();
      onClose();
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
      size="lg"
      icon={FiDatabase}
      title={place ? `Edit ${place.name}` : 'Add Place'}
      subtitle="Employees can search it by area and category"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="place-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />} Save place
          </button>
        </>
      }
    >
      <form id="place-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <input className="input" required minLength={2} value={f.name} onChange={set('name')} placeholder="e.g. Hotel Annapoorna" />
        </Field>
        <Field label="Category" hint="Add new types (School, Hotel…) in Settings → Business categories">
          <select className="input" value={f.categoryId} onChange={set('categoryId')}>
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Area / locality" required>
          <input className="input" required minLength={2} list="place-areas" value={f.area} onChange={set('area')} placeholder="e.g. Vidyaranyapura" />
          <datalist id="place-areas">
            {areas.map((a) => (
              <option key={a.area} value={a.area} />
            ))}
          </datalist>
        </Field>
        <Field label="City">
          <input className="input" value={f.city} onChange={set('city')} placeholder="Bengaluru" />
        </Field>
        <Field label="Pincode">
          <input className="input" inputMode="numeric" value={f.pincode} onChange={set('pincode')} placeholder="560097" />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <textarea rows={2} className="input" value={f.address} onChange={set('address')} placeholder="Street, landmark" />
        </Field>
        <Field label="Phone">
          <input type="tel" className="input" value={f.phone} onChange={set('phone')} placeholder="Used to match visits automatically" />
        </Field>
        <Field label="Contact person">
          <input className="input" value={f.contactPerson} onChange={set('contactPerson')} />
        </Field>
        <div className="sm:col-span-2">
          <p className="label">Location on map (optional – enables “Near me”)</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input !w-36" inputMode="decimal" value={f.lat} onChange={set('lat')} placeholder="Latitude" />
            <input className="input !w-36" inputMode="decimal" value={f.lng} onChange={set('lng')} placeholder="Longitude" />
            <button type="button" className="btn-secondary btn-sm" onClick={geo.capture} disabled={geo.loading}>
              {geo.loading ? <Spinner /> : <FiCrosshair />} Use my current location
            </button>
          </div>
          {geo.error && <p className="mt-1 text-xs text-rose-600">{geo.error}</p>}
        </div>
        <Field label="Notes" className="sm:col-span-2">
          <input className="input" value={f.notes} onChange={set('notes')} placeholder="e.g. Owner available after 4 PM" />
        </Field>
      </form>
    </Modal>
  );
}

// ---------- details ----------
function PlaceDetailModal({ open, onClose, placeId, canManage, canVisit, onEdit, onLogVisit }) {
  const { data, loading, error } = useApi(open && placeId ? `/places/${placeId}` : null, null, { enabled: !!(open && placeId) });
  const p = data?.place;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={FiMapPin}
      title={p?.name || 'Place'}
      subtitle={p ? [p.category?.name, p.area, p.city, p.pincode].filter(Boolean).join(' · ') : ''}
      footer={
        p && (
          <>
            {canManage && (
              <button className="btn-ghost mr-auto" onClick={() => onEdit(p)}>
                <FiEdit2 /> Edit
              </button>
            )}
            <a className="btn-secondary" href={directionsUrl(p)} target="_blank" rel="noreferrer">
              <FiNavigation /> Directions
            </a>
            {canVisit && (
              <button className="btn-primary" onClick={() => onLogVisit(p)}>
                <FiBriefcase /> Log visit here
              </button>
            )}
          </>
        )
      }
    >
      {loading && !data ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        p && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-3 text-sm">
              <VisitedBadge v={p.visit} />
              {p.address && <p className="text-slate-700">{p.address}</p>}
              {p.phone && (
                <p>
                  <a className="inline-flex items-center gap-1.5 font-semibold text-brand-600" href={`tel:${p.phone}`}>
                    <FiPhone /> {p.phone}
                  </a>
                  {p.contactPerson && <span className="text-slate-500"> · {p.contactPerson}</span>}
                </p>
              )}
              {p.notes && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">{p.notes}</p>}
              {p.createdBy && <p className="text-xs text-slate-400">Added by {p.createdBy.name}</p>}
            </div>
            <div>{p.lat != null ? <PointMap lat={p.lat} lng={p.lng} height={170} /> : <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No map location saved.</p>}</div>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm font-bold">Visit history ({data.visits.length})</p>
              {!data.visits.length ? (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nobody has visited this place yet – a fresh opportunity.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {data.visits.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <span>
                        <b>{v.user?.name}</b> <span className="text-slate-500">· {fmtDate(v.visitedAt)}</span>
                        {v.notes && <span className="block text-xs text-slate-500">{v.notes}</span>}
                      </span>
                      <span className="flex items-center gap-2 text-xs">
                        {v.dealValue != null && <b className="text-emerald-700">{fmtINR(v.dealValue)}</b>}
                        {v.nextFollowUp && v.status === 'FOLLOW_UP' && <span className="text-slate-500">F/U {fmtDate(v.nextFollowUp)}</span>}
                        <StatusBadge status={v.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      )}
    </Modal>
  );
}

// ---------- page ----------
export default function Places() {
  const { user } = useAuth();
  const canManage = user.role === 'ADMIN' || user.role === 'MANAGER';
  const isField = user.role === 'FIELD_VISITOR';
  const { categories } = useCatalog();
  const [f, setF] = useState({ q: '', area: '', categoryId: '', visited: '', page: 1, pageSize: 24 });
  const [view, setView] = useState('list');
  const [near, setNear] = useState(null); // {lat,lng}
  const [radius, setRadius] = useState(3);
  const geo = useCurrentLocation();
  const q = useDebounced(f.q);
  const params = { ...f, q, ...(near && { near: `${near.lat},${near.lng}`, radiusKm: radius }), ...(view === 'map' && { pageSize: 100 }) };
  const list = useApi('/places', params);
  const areas = useApi('/places/areas', f.categoryId ? { categoryId: f.categoryId } : null);
  const shiftQ = useApi(isField ? '/shifts/today' : null, null, { enabled: isField });
  const activeShift = shiftQ.data?.shift?.status === 'ACTIVE' || !!shiftQ.data?.openPrevious;

  const [form, setForm] = useState(null); // {place?}
  const [detail, setDetail] = useState(null);
  const [del, setDel] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [logVisit, setLogVisit] = useState(null);

  useEffect(() => {
    if (geo.coords && geo.coords.lat !== near?.lat) {
      setNear({ lat: geo.coords.lat, lng: geo.coords.lng });
      setF((x) => ({ ...x, page: 1 }));
    }
  }, [geo.coords]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (geo.error) toast.error(geo.error);
  }, [geo.error]);

  const set = (patch) => setF((x) => ({ ...x, ...patch, page: 1 }));
  const reload = () => {
    list.refetch(true);
    areas.refetch(true);
  };
  const startVisit = (p) => {
    if (!activeShift) return toast.error('Start your day shift first (Today tab), then log the visit');
    setDetail(null);
    setLogVisit({
      placeId: p.id,
      companyName: p.name,
      phone: p.phone || '',
      address: [p.address, p.area, p.city].filter(Boolean).join(', '),
      contactPerson: p.contactPerson || '',
      categoryId: p.category?.id || p.categoryId || '',
    });
  };

  const rows = list.data?.data || [];
  const c = list.data?.counts;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Places</h1>
          <p className="text-sm text-slate-500">Search businesses by area and type – see which ones are not visited yet</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>
              <FiUploadCloud /> Import
            </button>
            <button className="btn-primary" onClick={() => setForm({})}>
              <FiPlus /> Add place
            </button>
          </div>
        )}
      </div>

      {/* search & filters */}
      <div className="card space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder="Search name, area, pincode, phone… e.g. Vidyaranyapura" value={f.q} onChange={(e) => set({ q: e.target.value })} />
          </div>
          <div className="relative md:w-60">
            <FiMapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10 pr-8" list="area-options" placeholder="All areas" value={f.area} onChange={(e) => set({ area: e.target.value })} />
            {f.area && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400" onClick={() => set({ area: '' })} aria-label="Clear area">
                <FiX />
              </button>
            )}
            <datalist id="area-options">
              {(areas.data?.data || []).map((a) => (
                <option key={a.area} value={a.area}>
                  {a.count} places
                </option>
              ))}
            </datalist>
          </div>
        </div>
        <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[{ id: '', name: 'All types' }, ...categories].map((cat) => (
            <button
              key={cat.id || 'all'}
              onClick={() => set({ categoryId: cat.id })}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${f.categoryId === cat.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
            {[
              ['', 'All', c?.all],
              ['no', 'Not visited', c?.notVisited],
              ['yes', 'Visited', c?.visited],
              ['mine', isField ? 'By me' : 'By me', c?.mine],
            ]
              .filter(([v]) => isField || v !== 'mine')
              .map(([v, l, n]) => (
                <button key={v || 'all'} onClick={() => set({ visited: v })} className={`rounded-lg px-3 py-1.5 ${f.visited === v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'}`}>
                  {l}
                  {n != null && <span className="ml-1 text-slate-400">{n}</span>}
                </button>
              ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              className={`btn btn-sm ${near ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
              onClick={() => (near ? (setNear(null), set({})) : geo.capture())}
              disabled={geo.loading}
            >
              {geo.loading ? <Spinner /> : <FiCrosshair />} {near ? 'Near me ✓' : 'Near me'}
            </button>
            {near && (
              <select className="input !w-auto !py-1.5 text-xs" value={radius} onChange={(e) => (setRadius(Number(e.target.value)), set({}))}>
                {[1, 2, 3, 5, 10, 20].map((r) => (
                  <option key={r} value={r}>
                    within {r} km
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="ml-auto flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
            <button className={`flex items-center gap-1 rounded-lg px-3 py-1.5 ${view === 'list' ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => setView('list')}>
              <FiList /> List
            </button>
            <button className={`flex items-center gap-1 rounded-lg px-3 py-1.5 ${view === 'map' ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => setView('map')}>
              <FiMap /> Map
            </button>
          </div>
        </div>
      </div>

      {list.loading && !list.data ? (
        <PageLoader />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.refetch} />
      ) : !rows.length ? (
        <div className="card">
          <EmptyState
            icon={FiDatabase}
            title={f.q || f.area || f.categoryId || f.visited || near ? 'No places match' : 'No places yet'}
            message={canManage ? 'Add places one by one or import an Excel / CSV list.' : 'Try another area or category. Your manager can add more places.'}
            action={
              canManage && (
                <button className="btn-primary btn-sm" onClick={() => setImportOpen(true)}>
                  <FiUploadCloud /> Import places
                </button>
              )
            }
          />
        </div>
      ) : view === 'map' ? (
        <div className="card p-2">
          <PlacesMap places={rows} me={near} onSelect={(p) => setDetail(p.id)} height={560} />
          <p className="px-2 pt-2 text-xs text-slate-500">
            Showing {rows.length} of {list.data.meta.total} · <span className="font-semibold text-amber-600">● not visited</span> ·{' '}
            <span className="font-semibold text-emerald-600">● visited</span> · places without a saved location are not on the map
          </p>
        </div>
      ) : (
        <>
          <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${list.loading ? 'opacity-60' : ''}`}>
            {rows.map((p) => (
              <div key={p.id} className={`card flex flex-col p-4 ${p.visit ? '' : 'border-amber-200'} ${p.isActive ? '' : 'opacity-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <button className="min-w-0 text-left" onClick={() => setDetail(p.id)}>
                    <p className="truncate font-bold text-slate-900 hover:text-brand-600">{p.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[p.category?.name, p.area, p.pincode].filter(Boolean).join(' · ')}
                      {p.distanceKm != null && <b className="text-brand-600"> · {p.distanceKm} km</b>}
                    </p>
                  </button>
                  <VisitedBadge v={p.visit} compact />
                </div>
                {p.address && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{p.address}</p>}
                {p.visit && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Last: {p.visit.lastBy} · {fmtDate(p.visit.lastAt)} · {statusMeta(p.visit.lastStatus).label}
                    {p.visit.count > 1 ? ` · ${p.visit.count} visits` : ''}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                  {p.phone && (
                    <a className="btn-secondary btn-sm" href={`tel:${p.phone}`}>
                      <FiPhone /> Call
                    </a>
                  )}
                  <a className="btn-secondary btn-sm" href={directionsUrl(p)} target="_blank" rel="noreferrer">
                    <FiNavigation /> Go
                  </a>
                  {isField && (
                    <button className="btn-primary btn-sm" onClick={() => startVisit(p)}>
                      <FiBriefcase /> Log visit
                    </button>
                  )}
                  {canManage && (
                    <span className="ml-auto flex">
                      <button className="icon-btn !h-8 !w-8" onClick={() => setForm({ place: p })} title="Edit">
                        <FiEdit2 size={14} />
                      </button>
                      <button className="icon-btn !h-8 !w-8 hover:!text-rose-600" onClick={() => setDel(p)} title="Delete">
                        <FiTrash2 size={14} />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <Pagination meta={list.data.meta} onPage={(page) => setF((x) => ({ ...x, page }))} />
          </div>
        </>
      )}

      <PlaceFormModal open={!!form} place={form?.place} areas={areas.data?.data || []} onClose={() => setForm(null)} onSaved={reload} />
      <PlaceImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={reload} />
      <PlaceDetailModal
        open={!!detail}
        placeId={detail}
        canManage={canManage}
        canVisit={isField}
        onClose={() => setDetail(null)}
        onEdit={(p) => (setDetail(null), setForm({ place: p }))}
        onLogVisit={startVisit}
      />
      <VisitFormModal open={!!logVisit} prefill={logVisit} onClose={() => setLogVisit(null)} onSaved={() => (list.refetch(true), shiftQ.refetch(true))} />
      <ConfirmDialog
        open={!!del}
        title={`Delete ${del?.name}?`}
        message="If it already has visits it will be hidden instead, so visit history stays intact."
        confirmLabel="Delete"
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const { data } = await api.delete(`/places/${del.id}`);
          toast.success(data.deactivated ? 'Place hidden (it has visit history)' : 'Place deleted');
          reload();
        }}
      />
    </div>
  );
}
