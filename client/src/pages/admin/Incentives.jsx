import { Fragment, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  FiAward, FiPlus, FiEdit2, FiTrash2, FiLock, FiCheckCircle, FiClock, FiUsers, FiDollarSign, FiChevronDown, FiChevronRight, FiRotateCcw, FiZap,
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api, errMsg } from '../../api/client.js';
import Modal from '../../components/Modal.jsx';
import { Field, Spinner, PageLoader, ErrorState, EmptyState, ConfirmDialog, ExportMenu, Avatar } from '../../components/ui.jsx';
import { evaluateRule } from '../../utils/incentiveMath.js';
import { fmtINR, fmtDate, todayStr } from '../../utils/format.js';

// ---------- rule types shown to the admin ----------
export const TYPES = [
  {
    value: 'PER_DEAL',
    title: 'Fixed ₹ per deal',
    desc: 'Pay a fixed amount for every closed deal. Combine with a plan filter for “per plan” incentives.',
    rateLabel: 'Incentive per deal (₹)',
    example: '₹100 per Garage plan deal → 10 deals = ₹1,000',
  },
  {
    value: 'PERCENT_OF_AMOUNT',
    title: '% of plan amount',
    desc: 'Pay a percentage of the plan amount sold.',
    rateLabel: 'Percentage (%)',
    example: '10% of ₹1,000 plan = ₹100',
  },
  {
    value: 'PER_DEAL_COUNT',
    title: '₹ for every N deals',
    desc: 'Pay an amount for each block of deals in the month.',
    rateLabel: 'Incentive per block (₹)',
    everyLabel: 'Deals per block',
    example: '₹1,000 for every 10 deals → 25 deals = ₹2,000',
  },
  {
    value: 'PER_AMOUNT_SLAB',
    title: '₹ for every ₹X sold',
    desc: 'Pay for each slab of plan amount sold in the month.',
    rateLabel: 'Incentive per slab (₹)',
    everyLabel: 'Slab size – plan amount (₹)',
    example: '₹100 for every ₹1,000 sold → ₹5,500 sold = ₹500',
  },
  {
    value: 'DEAL_TARGET_BONUS',
    title: 'Bonus at N deals',
    desc: 'One-time bonus when the month’s deals reach a target.',
    rateLabel: 'Bonus (₹)',
    everyLabel: 'Target deals in the month',
    example: '₹2,000 bonus when 10 deals are closed',
  },
  {
    value: 'REVENUE_TARGET_BONUS',
    title: 'Bonus at ₹X sold',
    desc: 'One-time bonus when the month’s plan amount reaches a target.',
    rateLabel: 'Bonus (₹)',
    everyLabel: 'Target plan amount (₹)',
    example: '₹5,000 bonus at ₹1,00,000 sold',
  },
];
const typeMeta = (v) => TYPES.find((t) => t.value === v) || TYPES[0];

/** Plain-language one-liner for a rule */
export function ruleSummary(r) {
  const rate = Number(r.rate);
  const every = Number(r.every);
  const base = {
    PER_DEAL: `${fmtINR(rate)} for every deal`,
    PERCENT_OF_AMOUNT: `${rate}% of plan amount`,
    PER_DEAL_COUNT: `${fmtINR(rate)} for every ${every} deals`,
    PER_AMOUNT_SLAB: `${fmtINR(rate)} for every ${fmtINR(every)} sold`,
    DEAL_TARGET_BONUS: `${fmtINR(rate)} bonus at ${every} deals`,
    REVENUE_TARGET_BONUS: `${fmtINR(rate)} bonus at ${fmtINR(every)} sold`,
  }[r.type];
  const filters = [r.plan?.name && `plan ${r.plan.name}`, r.product?.name, r.category?.name].filter(Boolean);
  const extra = [
    filters.length ? `on ${filters.join(' · ')}` : 'on all deals',
    r.minDeals ? `min ${r.minDeals} deals` : null,
    r.maxPayout != null ? `max ${fmtINR(r.maxPayout)}/month` : null,
    r.effectiveFrom || r.effectiveTo ? `${r.effectiveFrom ? fmtDate(r.effectiveFrom) : '…'} – ${r.effectiveTo ? fmtDate(r.effectiveTo) : '…'}` : null,
  ].filter(Boolean);
  return `${base} · ${extra.join(' · ')}`;
}

const EMPTY_RULE = {
  name: '', description: '', appliesTo: 'FIELD_VISITOR', type: 'PER_DEAL', rate: '', every: '', minDeals: '', maxPayout: '',
  planId: '', productId: '', categoryId: '', effectiveFrom: '', effectiveTo: '', isActive: true,
};

// ---------- rule editor (admin) ----------
function RuleModal({ open, onClose, rule, catalog, onSaved }) {
  const [f, setF] = useState(EMPTY_RULE);
  const [busy, setBusy] = useState(false);
  const [trial, setTrial] = useState({ deals: 10, value: 1000 });
  useEffect(() => {
    if (!open) return;
    setF(
      rule
        ? Object.fromEntries(Object.keys(EMPTY_RULE).map((k) => [k, rule[k] == null ? '' : typeof rule[k] === 'boolean' ? rule[k] : String(rule[k])]))
        : EMPTY_RULE,
    );
    setTrial({ deals: 10, value: rule?.plan ? Number(catalog.plans.find((p) => p.id === rule.planId)?.price || 1000) : 1000 });
  }, [open, rule]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const t = typeMeta(f.type);

  const preview = useMemo(() => {
    const deals = Array.from({ length: Math.max(0, Math.min(1000, Number(trial.deals) || 0)) }, () => ({
      dealValue: Number(trial.value) || 0,
      planId: f.planId || null,
      productId: f.productId || null,
      categoryId: f.categoryId || null,
      closedDay: f.effectiveFrom || todayStr(),
    }));
    return evaluateRule(
      { ...f, rate: Number(f.rate) || 0, every: Number(f.every) || 0, minDeals: f.minDeals ? Number(f.minDeals) : null, maxPayout: f.maxPayout === '' ? null : Number(f.maxPayout) },
      deals,
    );
  }, [f, trial]);

  const pickPlan = (id) => {
    const p = catalog.plans.find((x) => x.id === id);
    setF((x) => ({ ...x, planId: id, ...(p?.productId && { productId: p.productId }) }));
    if (p) setTrial((tr) => ({ ...tr, value: Number(p.price) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = { ...f, every: t.everyLabel ? f.every : '' };
    try {
      rule ? await api.patch(`/incentives/rules/${rule.id}`, body) : await api.post('/incentives/rules', body);
      toast.success(rule ? 'Rule updated' : 'Rule added');
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
      size="xl"
      icon={FiAward}
      tone="amber"
      title={rule ? `Edit rule · ${rule.name}` : 'New Incentive Rule'}
      subtitle="Rules are calculated every month on closed deals. Several rules can apply together."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="rule-form" className="btn-primary" disabled={busy}>
            {busy && <Spinner />} Save rule
          </button>
        </>
      }
    >
      <form id="rule-form" onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <div>
            <p className="label">Who earns it</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['FIELD_VISITOR', 'Field employees', 'On their own deals'],
                ['MANAGER', 'Managers', 'On their whole team’s deals'],
              ].map(([v, l, d]) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setF((x) => ({ ...x, appliesTo: v }))}
                  className={`rounded-xl border p-3 text-left ${f.appliesTo === v ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <p className="text-sm font-bold">{l}</p>
                  <p className="text-xs text-slate-500">{d}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="label">How it is calculated</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TYPES.map((x) => (
                <button
                  type="button"
                  key={x.value}
                  onClick={() => setF((y) => ({ ...y, type: x.value }))}
                  className={`rounded-xl border p-3 text-left transition ${f.type === x.value ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-100' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <p className="text-sm font-bold">{x.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{x.example}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rule name" required className="sm:col-span-2">
              <input className="input" required minLength={2} value={f.name} onChange={set('name')} placeholder="e.g. Garage plan ₹100 per deal" />
            </Field>
            <Field label={t.rateLabel} required>
              <input type="number" min="0" step="0.01" max={f.type === 'PERCENT_OF_AMOUNT' ? 100 : undefined} required className="input" value={f.rate} onChange={set('rate')} />
            </Field>
            {t.everyLabel && (
              <Field label={t.everyLabel} required>
                <input type="number" min="1" step="1" required className="input" value={f.every} onChange={set('every')} />
              </Field>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-3 text-sm font-bold">Which deals count? <span className="font-normal text-slate-500">(leave empty for all deals)</span></p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Plan">
                <select className="input" value={f.planId} onChange={(e) => pickPlan(e.target.value)}>
                  <option value="">Any plan</option>
                  {catalog.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} – {fmtINR(p.price)}
                      {p.isActive ? '' : ' (inactive)'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Software">
                <select className="input" value={f.productId} onChange={set('productId')}>
                  <option value="">Any software</option>
                  {catalog.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Business category">
                <select className="input" value={f.categoryId} onChange={set('categoryId')}>
                  <option value="">Any category</option>
                  {catalog.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <details className="rounded-xl border border-slate-200 p-4" open={!!(f.minDeals || f.maxPayout || f.effectiveFrom || f.effectiveTo || f.description)}>
            <summary className="cursor-pointer text-sm font-bold">Advanced conditions</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Minimum deals in month" hint="Rule pays only after this many qualifying deals">
                <input type="number" min="0" className="input" value={f.minDeals} onChange={set('minDeals')} placeholder="No minimum" />
              </Field>
              <Field label="Maximum payout per month (₹)" hint="Cap for this rule per person">
                <input type="number" min="0" className="input" value={f.maxPayout} onChange={set('maxPayout')} placeholder="No cap" />
              </Field>
              <Field label="Valid from">
                <input type="date" className="input" value={f.effectiveFrom} onChange={set('effectiveFrom')} />
              </Field>
              <Field label="Valid until">
                <input type="date" className="input" value={f.effectiveTo} min={f.effectiveFrom || undefined} onChange={set('effectiveTo')} />
              </Field>
              <Field label="Note for employees" className="sm:col-span-2">
                <input className="input" value={f.description} onChange={set('description')} placeholder="e.g. Diwali special – valid this month only" />
              </Field>
            </div>
          </details>
        </div>

        {/* live preview */}
        <aside className="h-fit rounded-2xl border border-amber-200 bg-amber-50/60 p-4 lg:sticky lg:top-0">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <FiZap /> Try it
          </p>
          <p className="mt-1 text-xs text-amber-900/70">{t.desc}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Deals">
              <input type="number" min="0" className="input !py-2" value={trial.deals} onChange={(e) => setTrial((x) => ({ ...x, deals: e.target.value }))} />
            </Field>
            <Field label="₹ each">
              <input type="number" min="0" className="input !py-2" value={trial.value} onChange={(e) => setTrial((x) => ({ ...x, value: e.target.value }))} />
            </Field>
          </div>
          <div className="mt-4 rounded-xl bg-white p-3 text-center shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{f.appliesTo === 'MANAGER' ? 'Manager earns' : 'Employee earns'}</p>
            <p className="text-3xl font-extrabold text-emerald-700">{fmtINR(preview.earned)}</p>
            <p className="mt-1 text-xs text-slate-500">{preview.explain}</p>
          </div>
          <p className="mt-3 text-[11px] text-amber-900/70">
            Sold {trial.deals || 0} × {fmtINR(trial.value || 0)} = {fmtINR((Number(trial.deals) || 0) * (Number(trial.value) || 0))}
          </p>
        </aside>
      </form>
    </Modal>
  );
}

// ---------- payout modal (admin) ----------
function PayoutModal({ open, onClose, row, month, onSaved }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && row) {
      setAmount(String(row.payout ? row.payout.amount : row.total));
      setNote(row.payout?.note || '');
    }
  }, [open, row]);
  if (!row) return null;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/incentives/payouts', { userId: row.user.id, month, amount, note });
      toast.success(`Marked paid for ${row.user.name}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  const diff = Number(amount || 0) - row.total;
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      size="sm"
      icon={FiCheckCircle}
      tone="green"
      title={`Pay ${row.user.name}`}
      subtitle={`Incentive for ${month}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button form="payout-form" className="btn-success" disabled={busy || amount === ''}>
            {busy && <Spinner />} Mark as paid
          </button>
        </>
      }
    >
      <form id="payout-form" onSubmit={save} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          Calculated: <b>{fmtINR(row.total)}</b> on {row.deals} deals ({fmtINR(row.amount)})
        </div>
        <Field label="Amount paid (₹)" required hint={diff ? `${diff > 0 ? '+' : ''}${fmtINR(diff)} adjustment` : 'Same as calculated'}>
          <input type="number" min="0" step="0.01" required className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid with salary, UTR 1234" />
        </Field>
      </form>
    </Modal>
  );
}

// ---------- page ----------
export default function Incentives() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [managerId, setManagerId] = useState('');
  const [role, setRole] = useState('');
  const params = { month, ...(managerId && { managerId }), ...(role && { role }) };
  const report = useApi('/incentives/report', params);
  const rules = useApi('/incentives/rules');
  const catalog = useApi(isAdmin ? '/catalog' : null, { all: 'true' }, { enabled: isAdmin });
  const managers = useApi(isAdmin ? '/users/options' : null, { role: 'MANAGER' }, { enabled: isAdmin });
  const [ruleModal, setRuleModal] = useState(null);
  const [delRule, setDelRule] = useState(null);
  const [payRow, setPayRow] = useState(null);
  const [undo, setUndo] = useState(null);
  const [open, setOpen] = useState({});

  const refresh = () => {
    report.refetch(true);
    rules.refetch(true);
  };
  const toggleRule = async (r) => {
    try {
      await api.patch(`/incentives/rules/${r.id}`, { isActive: !r.isActive });
      toast.success(r.isActive ? 'Rule paused' : 'Rule activated');
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  if (report.loading && !report.data) return <PageLoader />;
  if (report.error && !report.data) return <ErrorState message={report.error} onRetry={report.refetch} />;
  const { rows, totals } = report.data;
  const ruleList = rules.data?.data || [];
  const groups = [
    ['FIELD_VISITOR', 'Field employees · own deals'],
    ['MANAGER', 'Managers · team deals'],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Incentives</h1>
          <p className="text-sm text-slate-500">
            {isAdmin ? 'Set incentive rules, see what everyone earned and record payouts' : 'Incentives for you and your team – rules are set by the admin'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" className="input !w-auto !py-2" value={month} max={todayStr().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          {isAdmin && (
            <select className="input !w-auto !py-2" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">All teams</option>
              {(managers.data?.data || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}'s team
                </option>
              ))}
            </select>
          )}
          <select className="input !w-auto !py-2" value={role} onChange={(e) => setRole(e.target.value)} disabled={!isAdmin}>
            <option value="">Employees & managers</option>
            <option value="FIELD_VISITOR">Field employees</option>
            <option value="MANAGER">Managers</option>
          </select>
          <ExportMenu type="incentives" params={params} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          ['Total incentive', fmtINR(totals.calculated), FiAward, 'text-amber-600 bg-amber-50'],
          ['Paid', fmtINR(totals.paid), FiCheckCircle, 'text-emerald-600 bg-emerald-50'],
          ['Pending', fmtINR(totals.pending), FiClock, 'text-rose-600 bg-rose-50'],
          ['People earning', `${totals.earners} / ${rows.length}`, FiUsers, 'text-brand-600 bg-brand-50'],
        ].map(([k, v, Icon, c]) => (
          <div key={k} className="card flex items-center gap-3 px-4 py-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k}</p>
              <p className="text-lg font-extrabold">{v}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        {/* report */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-bold">
              <FiDollarSign className="text-slate-400" /> Incentive report · {new Date(`${month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </p>
            <span className="text-xs text-slate-500">Deals counted by the date they were closed</span>
          </div>
          {!rows.length ? (
            <EmptyState icon={FiAward} title="No one in this view" />
          ) : (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-slate-50/60">
                  <tr>
                    <th className="th w-8" />
                    <th className="th">Person</th>
                    <th className="th">Deals</th>
                    <th className="th">Plan amount</th>
                    <th className="th">Incentive</th>
                    <th className="th">Payout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const me = r.user.id === user.id;
                    const isOpen = open[r.user.id];
                    return (
                      <Fragment key={r.user.id}>
                        <tr className={`cursor-pointer hover:bg-slate-50 ${me ? 'bg-brand-50/40' : ''} ${r.user.isActive ? '' : 'opacity-60'}`} onClick={() => setOpen((o) => ({ ...o, [r.user.id]: !o[r.user.id] }))}>
                          <td className="td text-slate-400">{isOpen ? <FiChevronDown /> : <FiChevronRight />}</td>
                          <td className="td">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={r.user.name} size="sm" />
                              <div>
                                <p className="text-sm font-semibold">
                                  {r.user.name} {me && <span className="text-xs font-bold text-brand-600">(you)</span>}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {r.user.role === 'MANAGER' ? 'Manager · team deals' : `Field employee${r.user.manager ? ` · ${r.user.manager}` : ''}`}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="td font-semibold">{r.deals}</td>
                          <td className="td text-sm">{fmtINR(r.amount)}</td>
                          <td className="td text-base font-extrabold text-emerald-700">{fmtINR(r.total)}</td>
                          <td className="td" onClick={(e) => e.stopPropagation()}>
                            {r.payout ? (
                              <div className="flex items-center gap-1.5">
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">Paid {fmtINR(r.payout.amount)}</span>
                                {isAdmin && (
                                  <>
                                    <button className="icon-btn !h-7 !w-7" title="Edit payout" onClick={() => setPayRow(r)}>
                                      <FiEdit2 size={12} />
                                    </button>
                                    <button className="icon-btn !h-7 !w-7" title="Undo payout" onClick={() => setUndo(r)}>
                                      <FiRotateCcw size={12} />
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : isAdmin ? (
                              <button className="btn-secondary btn-sm" disabled={r.total <= 0} onClick={() => setPayRow(r)}>
                                Mark paid
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-slate-500">{r.total > 0 ? 'Pending' : '—'}</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/70">
                            <td />
                            <td colSpan={5} className="px-4 pb-3 pt-1">
                              {r.lines.length ? (
                                <ul className="space-y-1.5">
                                  {r.lines.map((l) => (
                                    <li key={l.ruleId} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                                      <span>
                                        <b className="text-slate-800">{l.name}</b> <span className="text-slate-400">· {l.filter}</span>
                                        <span className="block text-slate-500">{l.explain}</span>
                                      </span>
                                      <span className={`font-bold ${l.earned ? 'text-emerald-700' : 'text-slate-400'}`}>{fmtINR(l.earned)}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-slate-500">No active rules for {r.user.role === 'MANAGER' ? 'managers' : 'field employees'}.</p>
                              )}
                              {r.payout && (
                                <p className="mt-2 text-[11px] text-slate-500">
                                  Paid {fmtDate(r.payout.paidAt)}
                                  {r.payout.paidBy ? ` by ${r.payout.paidBy}` : ''} · calculated then {fmtINR(r.payout.calculated)}
                                  {r.payout.note ? ` · ${r.payout.note}` : ''}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* rules */}
        <section className="card h-fit overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold">
                <FiAward className="text-slate-400" /> Incentive rules
              </p>
              <p className="text-xs text-slate-500">{isAdmin ? 'All active rules add up' : 'Set by admin'}</p>
            </div>
            {isAdmin ? (
              <button className="btn-primary btn-sm" onClick={() => setRuleModal({})} disabled={!catalog.data}>
                <FiPlus /> Add rule
              </button>
            ) : (
              <FiLock className="text-slate-400" />
            )}
          </div>
          {!ruleList.length ? (
            <EmptyState
              icon={FiAward}
              title="No incentive rules yet"
              message={isAdmin ? 'Add a rule – e.g. ₹100 per deal, or ₹1,000 for every 10 deals.' : 'Your admin has not set incentives yet.'}
              action={
                isAdmin && (
                  <button className="btn-primary btn-sm" onClick={() => setRuleModal({})} disabled={!catalog.data}>
                    <FiPlus /> Add rule
                  </button>
                )
              }
            />
          ) : (
            groups.map(([g, label]) => {
              const list = ruleList.filter((r) => r.appliesTo === g);
              if (!list.length) return null;
              return (
                <div key={g}>
                  <p className="bg-slate-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
                  <ul className="divide-y divide-slate-100">
                    {list.map((r) => (
                      <li key={r.id} className={`flex items-start gap-2 px-4 py-3 ${r.isActive ? '' : 'opacity-50'}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{r.name}</p>
                          <p className="text-xs text-slate-600">{ruleSummary(r)}</p>
                          {r.description && <p className="text-[11px] italic text-slate-400">{r.description}</p>}
                        </div>
                        {isAdmin && (
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={r.isActive}
                              onClick={() => toggleRule(r)}
                              title={r.isActive ? 'Active – click to pause' : 'Paused – click to activate'}
                              className={`relative mr-1 h-5 w-9 rounded-full transition ${r.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            >
                              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${r.isActive ? 'left-[18px]' : 'left-0.5'}`} />
                            </button>
                            <button className="icon-btn !h-8 !w-8" onClick={() => setRuleModal({ rule: r })} title="Edit" disabled={!catalog.data}>
                              <FiEdit2 size={14} />
                            </button>
                            <button className="icon-btn !h-8 !w-8 hover:!text-rose-600" onClick={() => setDelRule(r)} title="Delete">
                              <FiTrash2 size={14} />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      </div>

      {isAdmin && catalog.data && (
        <RuleModal open={!!ruleModal} rule={ruleModal?.rule} catalog={catalog.data} onClose={() => setRuleModal(null)} onSaved={refresh} />
      )}
      <PayoutModal open={!!payRow} row={payRow} month={month} onClose={() => setPayRow(null)} onSaved={() => report.refetch(true)} />
      <ConfirmDialog
        open={!!delRule}
        title={`Delete rule “${delRule?.name}”?`}
        message="Incentives will be recalculated without it. Payouts already recorded are not changed. Tip: pause the rule instead to keep it for later."
        confirmLabel="Delete"
        onClose={() => setDelRule(null)}
        onConfirm={async () => {
          await api.delete(`/incentives/rules/${delRule.id}`);
          toast.success('Rule deleted');
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!undo}
        title={`Undo payout for ${undo?.user?.name}?`}
        message="The month will show as pending again."
        confirmLabel="Undo payout"
        onClose={() => setUndo(null)}
        onConfirm={async () => {
          await api.delete(`/incentives/payouts/${undo.payout.id}`);
          toast.success('Payout removed');
          report.refetch(true);
        }}
      />
    </div>
  );
}
