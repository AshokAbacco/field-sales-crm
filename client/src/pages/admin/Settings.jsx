import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiCreditCard, FiTag, FiPackage, FiSettings, FiArrowUp, FiArrowDown, FiLock } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { invalidateCatalog } from '../../hooks/useCatalog.js';
import { api, errMsg } from '../../api/client.js';
import Modal from '../../components/Modal.jsx';
import { Field, Spinner, PageLoader, ErrorState, EmptyState, ConfirmDialog } from '../../components/ui.jsx';
import { BILLING_CYCLES, cycleMeta } from '../../utils/constants.js';
import { fmtINR } from '../../utils/format.js';

// ---------- generic form modal ----------
function FormModal({ open, onClose, title, subtitle, icon, initial, fields, onSubmit }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm(initial || {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(form);
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
      icon={icon}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="settings-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />} Save
          </button>
        </>
      }
    >
      <form id="settings-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.name} label={f.label} required={f.required} hint={f.hint} className={f.full ? 'sm:col-span-2' : ''}>
            {f.type === 'select' ? (
              <select className="input" required={f.required} value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                {f.placeholder !== false && <option value="">{f.placeholder || 'None'}</option>}
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea rows={2} className="input" value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} placeholder={f.placeholder} />
            ) : (
              <input
                type={f.type || 'text'}
                min={f.min}
                step={f.step}
                className="input"
                required={f.required}
                value={form[f.name] ?? ''}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                placeholder={f.placeholder}
              />
            )}
          </Field>
        ))}
      </form>
    </Modal>
  );
}

const Toggle = ({ on, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    disabled={disabled}
    onClick={onChange}
    className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
    title={on ? 'Active – shown in visit form' : 'Inactive – hidden from visit form'}
  >
    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);

const Card = ({ title, icon: Icon, sub, action, children, className = '' }) => (
  <section className={`card flex flex-col overflow-hidden ${className}`}>
    <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold">
          <Icon className="text-slate-400" /> {title}
        </p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
    <div className="flex-1">{children}</div>
  </section>
);

function FuelRate() {
  const { data, refetch } = useApi('/org/settings');
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setRate(String(data.fuelRatePerKm));
  }, [data]);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/org/settings', { fuelRatePerKm: Number(rate) });
      toast.success('Fuel rate updated – applies to shifts closed from now on');
      refetch(true);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="p-4">
      <div className="flex items-end gap-2">
        <Field label="Fuel allowance per KM (₹)" className="flex-1">
          <input type="number" min="0" step="0.01" className="input !py-2" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <button className="btn-primary !py-2" disabled={busy || rate === '' || Number(rate) === data?.fuelRatePerKm}>
          {busy && <Spinner />} Save
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Allowance = KM driven × rate, calculated when an employee punches out.</p>
      <label className="mt-4 flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-slate-200 p-3">
        <span>
          <span className="block text-sm font-semibold">Odometer photo required</span>
          <span className="block text-[11px] text-slate-500">
            Employees must photograph the bike odometer at punch-in and punch-out.
            {data && (data.photoStorage === 'cloudflare-r2' ? ' Photos are stored in Cloudflare R2.' : ' Photos are stored on the server (R2 not configured).')}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={!!data?.requireOdometerPhoto}
          disabled={!data || busy}
          onClick={async () => {
            try {
              await api.put('/org/settings', { requireOdometerPhoto: !data.requireOdometerPhoto });
              toast.success(data.requireOdometerPhoto ? 'Odometer photo is now optional' : 'Odometer photo is now required');
              refetch(true);
            } catch (err) {
              toast.error(errMsg(err));
            }
          }}
          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${data?.requireOdometerPhoto ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${data?.requireOdometerPhoto ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </label>
    </form>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const cat = useApi('/catalog', { all: 'true' });
  const [modal, setModal] = useState(null); // { kind, item }
  const [del, setDel] = useState(null); // { kind, item }
  const [planProduct, setPlanProduct] = useState('');

  if (cat.loading && !cat.data) return <PageLoader />;
  if (cat.error && !cat.data) return <ErrorState message={cat.error} onRetry={cat.refetch} />;
  const { categories, products, plans } = cat.data;
  const activeProducts = products.filter((p) => p.isActive);
  const productOpts = activeProducts.map((p) => ({ value: p.id, label: p.name }));
  const shownPlans = planProduct ? plans.filter((p) => (planProduct === 'none' ? !p.productId : p.productId === planProduct)) : plans;

  const done = (msg) => {
    toast.success(msg);
    invalidateCatalog();
    cat.refetch(true);
  };
  const patch = async (kind, item, data, msg) => {
    try {
      await api.patch(`/catalog/${kind}/${item.id}`, data);
      done(msg || 'Saved');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const move = async (list, idx, dir) => {
    const a = list[idx];
    const b = list[idx + dir];
    if (!a || !b) return;
    try {
      // Normalise to positions so equal sortOrders still swap
      await Promise.all([
        api.patch(`/catalog/categories/${a.id}`, { sortOrder: idx + dir + 1 }),
        api.patch(`/catalog/categories/${b.id}`, { sortOrder: idx + 1 }),
      ]);
      done('Order updated');
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const forms = {
    plans: {
      title: (it) => (it ? `Edit plan · ${it.name}` : 'Add Subscription Plan'),
      subtitle: 'Shown in the visit form when a deal is closed',
      icon: FiCreditCard,
      initial: (it) =>
        it
          ? { name: it.name, productId: it.productId || '', price: String(Number(it.price)), billingCycle: it.billingCycle, description: it.description || '' }
          : { productId: planProduct && planProduct !== 'none' ? planProduct : '', billingCycle: 'MONTHLY' },
      fields: [
        { name: 'name', label: 'Plan name', required: true, placeholder: 'e.g. Garage Pro', full: true },
        { name: 'productId', label: 'Software product', type: 'select', options: productOpts, placeholder: 'Any product' },
        { name: 'billingCycle', label: 'Billing cycle', type: 'select', required: true, placeholder: false, options: BILLING_CYCLES.map((c) => ({ value: c.value, label: c.label })) },
        { name: 'price', label: 'Price / amount (₹)', type: 'number', min: 0, step: '0.01', required: true, placeholder: '9999', full: true },
        { name: 'description', label: 'Description', type: 'textarea', placeholder: 'What is included (users, modules, support…)', full: true },
      ],
    },
    categories: {
      title: (it) => (it ? `Edit category · ${it.name}` : 'Add Business Category'),
      subtitle: 'Business types your field employees visit',
      icon: FiTag,
      initial: (it) => (it ? { name: it.name, defaultProductId: it.defaultProductId || '' } : {}),
      fields: [
        { name: 'name', label: 'Category name', required: true, placeholder: 'e.g. Bakery', full: true },
        { name: 'defaultProductId', label: 'Default software', type: 'select', options: productOpts, placeholder: 'No default', hint: 'Auto-selected in the visit form for this category', full: true },
      ],
    },
    products: {
      title: (it) => (it ? `Edit product · ${it.name}` : 'Add Software Product'),
      subtitle: 'Software your team pitches',
      icon: FiPackage,
      initial: (it) => (it ? { name: it.name, description: it.description || '' } : {}),
      fields: [
        { name: 'name', label: 'Product name', required: true, placeholder: 'e.g. ClinicDesk', full: true },
        { name: 'description', label: 'Short description', type: 'textarea', placeholder: 'Who it is for and key features', full: true },
      ],
    },
  };
  const fm = modal && forms[modal.kind];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          {isAdmin
            ? 'Subscription plans & prices, business categories, software products and travel reimbursement'
            : 'Subscription plans & prices your team can sell. Categories and products are managed by the admin.'}
        </p>
      </div>

      {/* Plans – admin & manager */}
      <Card
        title="Subscription plans & pricing"
        icon={FiCreditCard}
        sub="Field employees pick a plan when they close a deal; amount, billing cycle and next payment date fill in automatically."
        action={
          <button className="btn-primary btn-sm" onClick={() => setModal({ kind: 'plans' })}>
            <FiPlus /> Add plan
          </button>
        }
      >
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5">
          {[{ id: '', name: `All (${plans.length})` }, ...products.map((p) => ({ id: p.id, name: p.name })), { id: 'none', name: 'Any product' }].map((p) => (
            <button
              key={p.id || 'all'}
              onClick={() => setPlanProduct(p.id)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${planProduct === p.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {p.name}
            </button>
          ))}
        </div>
        {!shownPlans.length ? (
          <EmptyState
            icon={FiCreditCard}
            title="No plans yet"
            message="Add plans with prices so employees can record what they sold."
            action={
              <button className="btn-primary btn-sm" onClick={() => setModal({ kind: 'plans' })}>
                <FiPlus /> Add plan
              </button>
            }
          />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="th">Plan</th>
                  <th className="th">Product</th>
                  <th className="th">Price</th>
                  <th className="th">Billing</th>
                  <th className="th">Deals</th>
                  <th className="th">Added by</th>
                  <th className="th">Active</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shownPlans.map((p) => (
                  <tr key={p.id} className={p.isActive ? '' : 'opacity-50'}>
                    <td className="td">
                      <p className="font-semibold">{p.name}</p>
                      {p.description && <p className="max-w-xs truncate text-xs text-slate-500">{p.description}</p>}
                    </td>
                    <td className="td text-sm">{p.product?.name || <span className="text-slate-400">Any</span>}</td>
                    <td className="td font-bold text-emerald-700">{fmtINR(p.price)}</td>
                    <td className="td text-sm">{cycleMeta(p.billingCycle)?.label}</td>
                    <td className="td text-sm">{p._count?.visits ?? 0}</td>
                    <td className="td text-xs text-slate-500">{p.createdBy?.name || '—'}</td>
                    <td className="td">
                      <Toggle on={p.isActive} onChange={() => patch('plans', p, { isActive: !p.isActive }, p.isActive ? 'Plan hidden' : 'Plan activated')} />
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-0.5">
                        <button className="icon-btn" onClick={() => setModal({ kind: 'plans', item: p })} title="Edit">
                          <FiEdit2 />
                        </button>
                        <button className="icon-btn hover:!text-rose-600" onClick={() => setDel({ kind: 'plans', item: p })} title="Delete">
                          <FiTrash2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Categories */}
        <Card
          title="Business categories"
          icon={FiTag}
          sub={isAdmin ? 'Shown in the visit form dropdown, in this order' : 'Managed by admin'}
          action={
            isAdmin ? (
              <button className="btn-secondary btn-sm" onClick={() => setModal({ kind: 'categories' })}>
                <FiPlus /> Add
              </button>
            ) : (
              <FiLock className="text-slate-400" />
            )
          }
        >
          <ul className="divide-y divide-slate-100">
            {categories.map((c, i) => (
              <li key={c.id} className={`flex items-center gap-2 px-4 py-2.5 ${c.isActive ? '' : 'opacity-50'}`}>
                {isAdmin && (
                  <div className="flex flex-col">
                    <button className="text-slate-400 hover:text-slate-800 disabled:opacity-30" disabled={i === 0} onClick={() => move(categories, i, -1)} aria-label="Move up">
                      <FiArrowUp size={12} />
                    </button>
                    <button className="text-slate-400 hover:text-slate-800 disabled:opacity-30" disabled={i === categories.length - 1} onClick={() => move(categories, i, 1)} aria-label="Move down">
                      <FiArrowDown size={12} />
                    </button>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {c.defaultProduct ? `Default: ${c.defaultProduct.name}` : 'No default software'} · {c._count?.visits ?? 0} visits
                  </p>
                </div>
                {isAdmin && (
                  <>
                    <Toggle on={c.isActive} onChange={() => patch('categories', c, { isActive: !c.isActive }, c.isActive ? 'Category hidden' : 'Category activated')} />
                    <button className="icon-btn !h-8 !w-8" onClick={() => setModal({ kind: 'categories', item: c })} title="Edit">
                      <FiEdit2 size={14} />
                    </button>
                    <button className="icon-btn !h-8 !w-8 hover:!text-rose-600" onClick={() => setDel({ kind: 'categories', item: c })} title="Delete">
                      <FiTrash2 size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
            {!categories.length && <EmptyState icon={FiTag} title="No categories" />}
          </ul>
        </Card>

        {/* Products */}
        <Card
          title="Software products"
          icon={FiPackage}
          sub={isAdmin ? 'The "Software pitched" options' : 'Managed by admin'}
          action={
            isAdmin ? (
              <button className="btn-secondary btn-sm" onClick={() => setModal({ kind: 'products' })}>
                <FiPlus /> Add
              </button>
            ) : (
              <FiLock className="text-slate-400" />
            )
          }
        >
          <ul className="divide-y divide-slate-100">
            {products.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 px-4 py-2.5 ${p.isActive ? '' : 'opacity-50'}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {p._count?.plans ?? 0} plans · {p._count?.visits ?? 0} visits{p.description ? ` · ${p.description}` : ''}
                  </p>
                </div>
                {isAdmin && (
                  <>
                    <Toggle on={p.isActive} onChange={() => patch('products', p, { isActive: !p.isActive }, p.isActive ? 'Product hidden' : 'Product activated')} />
                    <button className="icon-btn !h-8 !w-8" onClick={() => setModal({ kind: 'products', item: p })} title="Edit">
                      <FiEdit2 size={14} />
                    </button>
                    <button className="icon-btn !h-8 !w-8 hover:!text-rose-600" onClick={() => setDel({ kind: 'products', item: p })} title="Delete">
                      <FiTrash2 size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
            {!products.length && <EmptyState icon={FiPackage} title="No products" />}
          </ul>
        </Card>

        {isAdmin ? (
          <Card title="Travel & odometer" icon={FiSettings}>
            <FuelRate />
          </Card>
        ) : (
          <Card title="Need a new category or product?" icon={FiSettings}>
            <p className="p-4 text-sm text-slate-600">Ask your admin to add it in Settings. New items appear in your team's visit form immediately.</p>
          </Card>
        )}
      </div>

      {fm && (
        <FormModal
          open
          onClose={() => setModal(null)}
          title={fm.title(modal.item)}
          subtitle={fm.subtitle}
          icon={fm.icon}
          initial={fm.initial(modal.item)}
          fields={fm.fields}
          onSubmit={async (form) => {
            if (modal.item) await api.patch(`/catalog/${modal.kind}/${modal.item.id}`, form);
            else await api.post(`/catalog/${modal.kind}`, form);
            done(modal.item ? 'Saved' : 'Added');
          }}
        />
      )}
      <ConfirmDialog
        open={!!del}
        title={`Delete ${del?.item?.name}?`}
        message="If it is already used in visits it will be deactivated instead, so past records and reports stay intact."
        confirmLabel="Delete"
        onClose={() => setDel(null)}
        onConfirm={async () => {
          const { data } = await api.delete(`/catalog/${del.kind}/${del.item.id}`);
          done(data.deactivated ? 'In use – deactivated instead of deleted' : 'Deleted');
        }}
      />
    </div>
  );
}
