import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FiBriefcase,
  FiEdit2,
  FiPhone,
  FiMapPin,
  FiCalendar,
  FiUser,
  FiFileText,
  FiCreditCard,
  FiUserPlus,
} from "react-icons/fi";
import Modal from "./Modal.jsx";
import LocationCapture from "./LocationCapture.jsx";
import { Field, Spinner, StatusBadge } from "./ui.jsx";
import { PointMap } from "./Maps.jsx";
import { api, errMsg } from "../api/client.js";
import { useCurrentLocation } from "../hooks/useGeo.js";
import { useCatalog } from "../hooks/useCatalog.js";
import { useAssignees } from "../hooks/useAssignees.js";
import {
  STATUSES,
  BILLING_CYCLES,
  cycleMeta,
  nextPaymentFor,
} from "../utils/constants.js";
import { fmtDate, fmtDateTime, fmtINR, toInputDate } from "../utils/format.js";

const EMPTY = {
  categoryId: "",
  productId: "",
  companyName: "",
  contactPerson: "",
  phone: "",
  email: "",
  status: "OPEN",
  address: "",
  odometerKm: "",
  planId: "",
  dealValue: "",
  billingCycle: "",
  nextPaymentDate: "",
  nextFollowUp: "",
  notes: "",
};

const planLabel = (p) =>
  `${p.name} – ${fmtINR(p.price)}${cycleMeta(p.billingCycle)?.short || ""}`;

/**
 * Plan / amount / billing cycle / next payment – shown when a deal is closed.
 * `value` holds { planId, dealValue, billingCycle, nextPaymentDate }.
 */
export function PlanFields({
  value,
  onChange,
  productId,
  errors = {},
  currentPlan,
}) {
  const { plans } = useCatalog();
  // Plans for the pitched product first, then generic plans (no product)
  const options = useMemo(() => {
    const list = plans.filter(
      (p) => !productId || !p.productId || p.productId === productId,
    );
    if (currentPlan && !list.some((p) => p.id === currentPlan.id))
      list.unshift(currentPlan);
    return list;
  }, [plans, productId, currentPlan]);
  const set = (patch) => onChange({ ...value, ...patch });

  const pickPlan = (id) => {
    const p = options.find((x) => x.id === id);
    if (!p) return set({ planId: "" });
    set({
      planId: p.id,
      dealValue: String(Number(p.price)),
      billingCycle: p.billingCycle,
      nextPaymentDate: nextPaymentFor(p.billingCycle) || value.nextPaymentDate,
    });
  };
  const selected = options.find((p) => p.id === value.planId);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-800">
        <FiCreditCard /> Subscription sold
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Plan"
          className="sm:col-span-2"
          hint={
            options.length
              ? selected?.description ||
                "Price, cycle and next payment fill in automatically – you can still edit them"
              : "No plans yet – ask your manager/admin to add plans in Settings"
          }
        >
          <select
            className="input"
            value={value.planId || ""}
            onChange={(e) => pickPlan(e.target.value)}
          >
            <option value="">Custom / no plan</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {planLabel(p)}
                {p.product?.name && p.productId !== productId
                  ? ` (${p.product.name})`
                  : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Plan amount (₹)"
          required
          error={errors.dealValue}
          hint={
            selected && Number(value.dealValue) !== Number(selected.price)
              ? `List price ${fmtINR(selected.price)}`
              : null
          }
        >
          <input
            type="number"
            inputMode="decimal"
            min="0"
            className={`input ${errors.dealValue ? "input-error" : ""}`}
            value={value.dealValue ?? ""}
            onChange={(e) => set({ dealValue: e.target.value })}
            placeholder="Agreed amount"
          />
        </Field>
        <Field label="Billing cycle">
          <select
            className="input"
            value={value.billingCycle || ""}
            onChange={(e) =>
              set({
                billingCycle: e.target.value,
                nextPaymentDate: nextPaymentFor(e.target.value) || "",
              })
            }
          >
            <option value="">Select</option>
            {BILLING_CYCLES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Next payment date"
          className="sm:col-span-2"
          hint={
            value.billingCycle === "ONE_TIME"
              ? "One-time payment – leave empty"
              : "Used for renewal reminders"
          }
        >
          <input
            type="date"
            className="input"
            value={value.nextPaymentDate || ""}
            onChange={(e) => set({ nextPaymentDate: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

/** Create (field employee) or edit (owner/manager/admin) a visit */
/**
 * Create / edit a visit.
 * leadMode: Manager/Admin adds a client lead (no GPS / bike KM, can assign an owner) → POST /leads
 */
export function VisitFormModal({
  open,
  onClose,
  visit,
  onSaved,
  leadMode = false,
}) {
  const isEdit = !!visit;
  const assignees = useAssignees(open && leadMode && !isEdit);
  const [assignToId, setAssignToId] = useState("");
  // Managers keep new leads themselves by default
  useEffect(() => {
    if (
      open &&
      leadMode &&
      !isEdit &&
      !assignToId &&
      assignees[0]?.name?.endsWith("(me)")
    )
      setAssignToId(assignees[0].id);
  }, [open, leadMode, isEdit, assignees]); // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useCurrentLocation();
  const { categories, products, loading: catLoading } = useCatalog();
  const [form, setForm] = useState(EMPTY);
  const [loc, setLoc] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setLoc(null);
    setAssignToId("");
    setForm(
      visit
        ? {
            ...EMPTY,
            ...Object.fromEntries(
              Object.entries(visit)
                .filter(([k]) => k in EMPTY)
                .map(([k, v]) => [k, v ?? ""]),
            ),
            categoryId: visit.categoryId || visit.category?.id || "",
            nextFollowUp: toInputDate(visit.nextFollowUp),
            nextPaymentDate: toInputDate(visit.nextPaymentDate),
            dealValue:
              visit.dealValue != null ? String(Number(visit.dealValue)) : "",
          }
        : EMPTY,
    );
  }, [open, visit]);

  // Keep a visit's current (possibly deactivated) category/product selectable when editing
  const catOptions = useMemo(() => {
    const list = [...categories];
    if (visit?.category && !list.some((c) => c.id === visit.category.id))
      list.push({ ...visit.category, inactive: true });
    return list;
  }, [categories, visit]);
  const prodOptions = useMemo(() => {
    const list = [...products];
    if (visit?.productId && !list.some((p) => p.id === visit.productId))
      list.push({ id: visit.productId, name: visit.product, inactive: true });
    return list;
  }, [products, visit]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "categoryId" && !isEdit) {
        const def = categories.find((c) => c.id === v)?.defaultProductId;
        if (def && products.some((p) => p.id === def)) next.productId = def;
      }
      return next;
    });
    setErrors((er) => ({ ...er, [k]: null }));
  };

  const validate = () => {
    const er = {};
    if (!form.categoryId) er.categoryId = "Select a category";
    if (!form.productId) er.productId = "Select a product";
    if (form.companyName.trim().length < 2)
      er.companyName = "Business name is required";
    if (!/^[+\d][\d\s-]{6,18}$/.test(form.phone.trim()))
      er.phone = "Enter a valid phone number";
    const isLead =
      leadMode || (isEdit && visit.source && visit.source !== "FIELD_VISIT");
    if (!isLead && form.address.trim().length < 3)
      er.address = "Address is required";
    if (leadMode && !isEdit && !assignToId)
      er.assignToId = "Choose who owns this lead";
    if (form.status === "FOLLOW_UP" && !form.nextFollowUp)
      er.nextFollowUp = "Pick a follow-up date";
    if (form.status === "DEAL_DONE" && form.dealValue === "")
      er.dealValue = "Enter the plan amount";
    setErrors(er);
    return !Object.keys(er).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return toast.error("Please fix the highlighted fields");
    setBusy(true);
    const deal = form.status === "DEAL_DONE";
    const payload = {
      categoryId: form.categoryId,
      productId: form.productId,
      companyName: form.companyName,
      contactPerson: form.contactPerson,
      phone: form.phone,
      email: form.email,
      status: form.status,
      address: form.address,
      odometerKm: form.odometerKm,
      planId: deal ? form.planId : "",
      dealValue: deal ? form.dealValue : "",
      billingCycle: deal ? form.billingCycle : "",
      nextPaymentDate: deal ? form.nextPaymentDate : "",
      nextFollowUp: form.nextFollowUp,
      notes: form.notes,
      ...(loc && { lat: loc.coords.lat, lng: loc.coords.lng }),
    };
    try {
      const { data } = isEdit
        ? await api.patch(`/visits/${visit.id}`, payload)
        : leadMode
          ? await api.post("/leads", { ...payload, odometerKm: "", assignToId })
          : await api.post("/visits", payload);
      toast.success(
        isEdit
          ? "Saved"
          : leadMode
            ? deal
              ? "Client added as a closed deal 🎉"
              : "Lead added"
            : deal
              ? "Deal closed & visit logged 🎉"
              : "Visit logged",
      );
      onSaved?.(data.visit);
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const inp = (k) => `input ${errors[k] ? "input-error" : ""}`;
  const selectedProduct = products.find((p) => p.id === form.productId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={isEdit ? FiEdit2 : leadMode ? FiUserPlus : FiBriefcase}
      title={
        isEdit
          ? "Edit Visit / Lead"
          : leadMode
            ? "Add Client / Lead"
            : "Log Field Visit"
      }
      subtitle={
        isEdit
          ? visit.companyName
          : leadMode
            ? "Add a client you already have – keep it yourself or assign it to an employee"
            : "Capture the business, pitch and outcome of this visit"
      }
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button form="visit-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />}{" "}
            {isEdit ? "Save changes" : leadMode ? "Save lead" : "Save visit"}
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
                  form.status === s.value
                    ? `${s.cls} ring-2 border-transparent`
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {form.status === "DEAL_DONE" && (
          <PlanFields
            value={form}
            productId={form.productId}
            errors={errors}
            currentPlan={
              visit?.planId
                ? {
                    id: visit.planId,
                    name: visit.planName,
                    price: visit.dealValue,
                    billingCycle: visit.billingCycle,
                  }
                : null
            }
            onChange={(v) => (
              setForm((f) => ({ ...f, ...v })),
              setErrors((er) => ({ ...er, dealValue: null }))
            )}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business category" required error={errors.categoryId}>
            <select
              className={inp("categoryId")}
              value={form.categoryId}
              onChange={set("categoryId")}
              disabled={catLoading && !categories.length}
            >
              <option value="">
                {catLoading && !categories.length
                  ? "Loading…"
                  : "Select category"}
              </option>
              {catOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.inactive ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Software pitched"
            required
            error={errors.productId}
            hint={selectedProduct?.description}
          >
            <select
              className={inp("productId")}
              value={form.productId}
              onChange={set("productId")}
            >
              <option value="">Select product</option>
              {prodOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.inactive ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Business name"
            required
            error={errors.companyName}
            className="sm:col-span-2"
          >
            <input
              className={inp("companyName")}
              value={form.companyName}
              onChange={set("companyName")}
              placeholder="e.g. Speed Auto Garage"
            />
          </Field>
          <Field label="Contact person">
            <input
              className="input"
              value={form.contactPerson}
              onChange={set("contactPerson")}
              placeholder="Owner / manager name"
            />
          </Field>
          <Field label="Phone" required error={errors.phone}>
            <input
              type="tel"
              inputMode="tel"
              className={inp("phone")}
              value={form.phone}
              onChange={set("phone")}
              placeholder="98450 00000"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={set("email")}
              placeholder="optional"
            />
          </Field>
          {leadMode && !isEdit ? (
            <Field
              label="Owner (gets the incentive)"
              required
              error={errors.assignToId}
            >
              <select
                className={inp("assignToId")}
                value={assignToId}
                onChange={(e) => (
                  setAssignToId(e.target.value),
                  setErrors((er) => ({ ...er, assignToId: null }))
                )}
              >
                <option value="">Select owner</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            !leadMode &&
            !(isEdit && visit.source && visit.source !== "FIELD_VISIT") && (
              <Field label="Bike KM at this visit">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  className="input"
                  value={form.odometerKm}
                  onChange={set("odometerKm")}
                  placeholder="optional"
                />
              </Field>
            )
          )}
          <Field
            label="Address"
            required={!leadMode}
            error={errors.address}
            className="sm:col-span-2"
          >
            <textarea
              rows={2}
              className={inp("address")}
              value={form.address}
              onChange={set("address")}
              placeholder="Shop no, street, area"
            />
          </Field>
        </div>

        {open && !isEdit && !leadMode && (
          <LocationCapture
            geo={geo}
            label="Visit location (GPS)"
            onChange={(l) => {
              setLoc(l);
              if (l.address)
                setForm((f) => (f.address ? f : { ...f, address: l.address }));
            }}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {(form.status === "FOLLOW_UP" || form.status === "OPEN") && (
            <Field
              label="Next follow-up"
              required={form.status === "FOLLOW_UP"}
              error={errors.nextFollowUp}
            >
              <input
                type="date"
                className={inp("nextFollowUp")}
                value={form.nextFollowUp}
                onChange={set("nextFollowUp")}
              />
            </Field>
          )}
          <Field label="Meeting notes" className="sm:col-span-2">
            <textarea
              rows={3}
              className="input"
              value={form.notes}
              onChange={set("notes")}
              placeholder="What was discussed, objections, next steps…"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

const Row = ({ icon: Icon, label, children }) => (
  <div className="flex gap-3 py-2.5">
    <Icon className="mt-0.5 shrink-0 text-slate-400" />
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="text-sm font-medium text-slate-800">
        {children || "—"}
      </div>
    </div>
  </div>
);

/** Read-only details with quick status update (+ plan capture when closing a deal); managers/admins add guidance */
export function VisitDetailModal({
  open,
  onClose,
  visit,
  isAdmin,
  onUpdated,
  onEdit,
}) {
  const assignees = useAssignees(open && isAdmin);
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState(visit?.status);
  const [note, setNote] = useState("");
  const [deal, setDeal] = useState({});
  const [dealErr, setDealErr] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (visit) {
      setStatus(visit.status);
      setOwner(visit.userId);
      setNote(visit.adminNote || "");
      setDealErr({});
      setDeal({
        planId: visit.planId || "",
        dealValue:
          visit.dealValue != null ? String(Number(visit.dealValue)) : "",
        billingCycle: visit.billingCycle || "",
        nextPaymentDate: toInputDate(visit.nextPaymentDate),
      });
    }
  }, [visit]);
  if (!visit) return null;

  const closingDeal = status === "DEAL_DONE" && visit.status !== "DEAL_DONE";
  const ownerChanged = isAdmin && owner && owner !== visit.userId;
  const dirty =
    status !== visit.status ||
    ownerChanged ||
    (isAdmin && note !== (visit.adminNote || ""));
  const save = async () => {
    if (closingDeal && deal.dealValue === "") {
      setDealErr({ dealValue: "Enter the plan amount" });
      return;
    }
    setBusy(true);
    try {
      const body = {
        status,
        ...(isAdmin && { adminNote: note }),
        ...(ownerChanged && { userId: owner }),
        ...(closingDeal && deal),
      };
      const { data } = await api.patch(`/visits/${visit.id}`, body);
      toast.success(closingDeal ? "Deal closed 🎉" : "Visit updated");
      onUpdated?.(data.visit);
      onClose();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const overduePay =
    visit.nextPaymentDate &&
    new Date(visit.nextPaymentDate) < new Date(new Date().toDateString());

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={FiBriefcase}
      title={visit.companyName}
      subtitle={`${visit.category?.name || "—"} · ${visit.product}`}
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
          <button
            className="btn-primary"
            onClick={save}
            disabled={!dirty || busy}
          >
            {busy && <Spinner />} Save
          </button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="divide-y divide-slate-100">
          <Row icon={FiUser} label="Contact">
            {visit.contactPerson || "—"}
          </Row>
          <Row icon={FiPhone} label="Phone">
            <a
              className="text-brand-600 hover:underline"
              href={`tel:${visit.phone}`}
            >
              {visit.phone}
            </a>
            {visit.email && (
              <span className="block text-slate-500">{visit.email}</span>
            )}
          </Row>
          <Row icon={FiMapPin} label="Address">
            {visit.address}
          </Row>
          <Row
            icon={FiCalendar}
            label={
              visit.source && visit.source !== "FIELD_VISIT"
                ? "Added"
                : "Visited"
            }
          >
            {fmtDateTime(visit.visitedAt)}
            {visit.user && (
              <span className="block text-slate-500">
                Owner: {visit.user.name}
              </span>
            )}
            {visit.source && visit.source !== "FIELD_VISIT" && (
              <span className="block text-xs text-slate-500">
                {visit.source === "IMPORT" ? "Imported" : "Added manually"}
                {visit.createdBy ? ` by ${visit.createdBy.name}` : ""}
              </span>
            )}
            {visit.dealClosedAt && (
              <span className="block text-xs font-semibold text-emerald-700">
                Deal closed {fmtDate(visit.dealClosedAt)}
              </span>
            )}
          </Row>
          {visit.nextFollowUp && (
            <Row icon={FiCalendar} label="Next follow-up">
              {fmtDate(visit.nextFollowUp)}
            </Row>
          )}
          {(visit.planName || visit.dealValue != null) && (
            <Row icon={FiCreditCard} label="Subscription">
              <span className="block">
                {visit.planName || "Custom plan"} · {fmtINR(visit.dealValue)}
                {cycleMeta(visit.billingCycle)?.short || ""}
              </span>
              {visit.nextPaymentDate && (
                <span
                  className={`block text-xs ${overduePay ? "font-bold text-rose-600" : "text-slate-500"}`}
                >
                  Next payment {fmtDate(visit.nextPaymentDate)}
                  {overduePay ? " · overdue" : ""}
                </span>
              )}
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
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {isAdmin && assignees.length > 0 && (
            <Field
              label="Owner"
              hint="Reassign this lead – the owner gets the incentive when it converts"
            >
              <select
                className="input"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                {!assignees.some((a) => a.id === visit.userId) && (
                  <option value={visit.userId}>
                    {visit.user?.name || "Current owner"}
                  </option>
                )}
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {isAdmin ? (
            <Field label="Guidance for the representative">
              <textarea
                rows={3}
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Offer 1 month free trial, call owner after 6 PM"
              />
            </Field>
          ) : (
            visit.adminNote && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="text-xs font-bold uppercase text-amber-700">
                  Manager guidance
                </p>
                <p className="mt-1 text-amber-900">{visit.adminNote}</p>
              </div>
            )
          )}
        </div>
        {closingDeal && (
          <div className="sm:col-span-2">
            <PlanFields
              value={deal}
              productId={visit.productId}
              errors={dealErr}
              onChange={(v) => (setDeal(v), setDealErr({}))}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
