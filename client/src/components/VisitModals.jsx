import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiBriefcase, FiEdit2, FiPhone, FiMapPin, FiCalendar, FiUser, FiFileText } from 'react-icons/fi';
import Modal from './Modal.jsx';
import LocationCapture from './LocationCapture.jsx';
import { Field, Spinner, StatusBadge } from './ui.jsx';
import { PointMap } from './Maps.jsx';
import { api, errMsg } from '../api/client.js';
import { useCurrentLocation } from '../hooks/useGeo.js';
import { CATEGORIES, PRODUCTS, STATUSES, categoryLabel } from '../utils/constants.js';
import { fmtDate, fmtDateTime, fmtINR, toInputDate } from '../utils/format.js';

const EMPTY = {
  category: '',
  product: '',
  companyName: '',
  contactPerson: '',
  phone: '',
  email: '',
  status: 'OPEN',
  address: '',
  odometerKm: '',
  dealValue: '',
  nextFollowUp: '',
  notes: '',
};

/** Create (field visitor) or edit (owner/admin) a visit */
export function VisitFormModal({ open, onClose, visit, onSaved }) {
  const isEdit = !!visit;
  const geo = useCurrentLocation();
  const [form, setForm] = useState(EMPTY);
  const [loc, setLoc] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setLoc(null);
    setForm(
      visit
        ? {
            ...EMPTY,
            ...Object.fromEntries(Object.entries(visit).map(([k, v]) => [k, v ?? ''])),
            nextFollowUp: toInputDate(visit.nextFollowUp),
            dealValue: visit.dealValue ?? '',
          }
        : EMPTY,
    );
  }, [open, visit]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'category' && !isEdit) next.product = CATEGORIES.find((c) => c.value === v)?.product || f.product;
      return next;
    });
    setErrors((er) => ({ ...er, [k]: null }));
  };

  const validate = () => {
    const er = {};
    if (!form.category) er.category = 'Select a category';
    if (!form.product) er.product = 'Select a product';
    if (form.companyName.trim().length < 2) er.companyName = 'Business name is required';
    if (!/^[+\d][\d\s-]{6,18}$/.test(form.phone.trim())) er.phone = 'Enter a valid phone number';
    if (form.address.trim().length < 3) er.address = 'Address is required';
    if (form.status === 'FOLLOW_UP' && !form.nextFollowUp) er.nextFollowUp = 'Pick a follow-up date';
    if (form.status === 'DEAL_DONE' && form.dealValue === '') er.dealValue = 'Enter deal value';
    setErrors(er);
    return !Object.keys(er).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return toast.error('Please fix the highlighted fields');
    setBusy(true);
    const payload = {
      category: form.category,
      product: form.product,
      companyName: form.companyName,
      contactPerson: form.contactPerson,
      phone: form.phone,
      email: form.email,
      status: form.status,
      address: form.address,
      odometerKm: form.odometerKm,
      dealValue: form.status === 'DEAL_DONE' ? form.dealValue : '',
      nextFollowUp: form.nextFollowUp,
      notes: form.notes,
      ...(loc && { lat: loc.coords.lat, lng: loc.coords.lng }),
    };
    try {
      const { data } = isEdit ? await api.patch(`/visits/${visit.id}`, payload) : await api.post('/visits', payload);
      toast.success(isEdit ? 'Visit updated' : 'Visit logged');
      onSaved?.(data.visit);
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const inp = (k) => `input ${errors[k] ? 'input-error' : ''}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={isEdit ? FiEdit2 : FiBriefcase}
      title={isEdit ? 'Edit Visit' : 'Log Field Visit'}
      subtitle={isEdit ? visit.companyName : 'Capture the business, pitch and outcome of this visit'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="visit-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />} {isEdit ? 'Save changes' : 'Save visit'}
          </button>
        </>
      }
    >
      <form id="visit-form" onSubmit={submit} className="space-y-5" noValidate>
        <div>
          <p className="label">
            Visit status <span className="text-rose-500">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUSES.map((s) => (
              <button
                type="button"
                key={s.value}
                onClick={() => setForm((f) => ({ ...f, status: s.value }))}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  form.status === s.value ? `${s.cls} ring-2 border-transparent` : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business category" required error={errors.category}>
            <select className={inp('category')} value={form.category} onChange={set('category')}>
              <option value="">Select category</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Software pitched" required error={errors.product}>
            <select className={inp('product')} value={form.product} onChange={set('product')}>
              <option value="">Select product</option>
              {PRODUCTS.map((p) => (
                <option key={p.value} value={p.value} title={p.desc}>
                  {p.value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Business name" required error={errors.companyName} className="sm:col-span-2">
            <input className={inp('companyName')} value={form.companyName} onChange={set('companyName')} placeholder="e.g. Speed Auto Garage" />
          </Field>
          <Field label="Contact person">
            <input className="input" value={form.contactPerson} onChange={set('contactPerson')} placeholder="Owner / manager name" />
          </Field>
          <Field label="Phone" required error={errors.phone}>
            <input type="tel" inputMode="tel" className={inp('phone')} value={form.phone} onChange={set('phone')} placeholder="98450 00000" />
          </Field>
          <Field label="Email">
            <input type="email" className="input" value={form.email} onChange={set('email')} placeholder="optional" />
          </Field>
          <Field label="Bike KM at this visit">
            <input type="number" inputMode="decimal" min="0" step="0.1" className="input" value={form.odometerKm} onChange={set('odometerKm')} placeholder="optional" />
          </Field>
          <Field label="Address" required error={errors.address} className="sm:col-span-2">
            <textarea rows={2} className={inp('address')} value={form.address} onChange={set('address')} placeholder="Shop no, street, area" />
          </Field>
        </div>

        {open && !isEdit && (
          <LocationCapture
            geo={geo}
            label="Visit location (GPS)"
            onChange={(l) => {
              setLoc(l);
              if (l.address) setForm((f) => (f.address ? f : { ...f, address: l.address }));
            }}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {(form.status === 'FOLLOW_UP' || form.status === 'OPEN') && (
            <Field label="Next follow-up" required={form.status === 'FOLLOW_UP'} error={errors.nextFollowUp}>
              <input type="date" className={inp('nextFollowUp')} value={form.nextFollowUp} onChange={set('nextFollowUp')} />
            </Field>
          )}
          {form.status === 'DEAL_DONE' && (
            <Field label="Deal value (₹)" required error={errors.dealValue}>
              <input type="number" inputMode="decimal" min="0" className={inp('dealValue')} value={form.dealValue} onChange={set('dealValue')} placeholder="Subscription amount" />
            </Field>
          )}
          <Field label="Meeting notes" className="sm:col-span-2">
            <textarea rows={3} className="input" value={form.notes} onChange={set('notes')} placeholder="What was discussed, objections, next steps…" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/** Read-only details with quick status update; admins can add a note */
export function VisitDetailModal({ open, onClose, visit, isAdmin, onUpdated, onEdit }) {
  const [status, setStatus] = useState(visit?.status);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visit) {
      setStatus(visit.status);
      setNote(visit.adminNote || '');
    }
  }, [visit]);
  if (!visit) return null;

  const dirty = status !== visit.status || (isAdmin && note !== (visit.adminNote || ''));
  const save = async () => {
    setBusy(true);
    try {
      const body = { status, ...(isAdmin && { adminNote: note }) };
      const { data } = await api.patch(`/visits/${visit.id}`, body);
      toast.success('Visit updated');
      onUpdated?.(data.visit);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ icon: Icon, label, children }) => (
    <div className="flex gap-3 py-2.5">
      <Icon className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <div className="text-sm font-medium text-slate-800">{children || '—'}</div>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={FiBriefcase}
      title={visit.companyName}
      subtitle={`${categoryLabel(visit.category)} · ${visit.product}`}
      footer={
        <>
          {onEdit && (
            <button className="btn-ghost mr-auto" onClick={() => onEdit(visit)}>
              <FiEdit2 /> Edit details
            </button>
          )}
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button className="btn-primary" onClick={save} disabled={!dirty || busy}>
            {busy && <Spinner />} Save
          </button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="divide-y divide-slate-100">
          <Row icon={FiUser} label="Contact">
            {visit.contactPerson || '—'}
          </Row>
          <Row icon={FiPhone} label="Phone">
            <a className="text-brand-600 hover:underline" href={`tel:${visit.phone}`}>
              {visit.phone}
            </a>
            {visit.email && <span className="block text-slate-500">{visit.email}</span>}
          </Row>
          <Row icon={FiMapPin} label="Address">
            {visit.address}
          </Row>
          <Row icon={FiCalendar} label="Visited">
            {fmtDateTime(visit.visitedAt)}
            {visit.user && <span className="block text-slate-500">by {visit.user.name}</span>}
          </Row>
          {visit.nextFollowUp && (
            <Row icon={FiCalendar} label="Next follow-up">
              {fmtDate(visit.nextFollowUp)}
            </Row>
          )}
          {visit.dealValue != null && (
            <Row icon={FiBriefcase} label="Deal value">
              {fmtINR(visit.dealValue)}
            </Row>
          )}
          <Row icon={FiFileText} label="Notes">
            <span className="whitespace-pre-wrap">{visit.notes}</span>
          </Row>
        </div>
        <div className="space-y-4">
          <PointMap lat={visit.lat} lng={visit.lng} />
          <div>
            <p className="label">Status</p>
            <div className="mb-2">
              <StatusBadge status={visit.status} />
            </div>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {isAdmin ? (
            <Field label="Admin note / guidance">
              <textarea rows={3} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Guidance for the field visitor" />
            </Field>
          ) : (
            visit.adminNote && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="text-xs font-bold uppercase text-amber-700">Admin guidance</p>
                <p className="mt-1 text-amber-900">{visit.adminNote}</p>
              </div>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
