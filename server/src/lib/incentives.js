import { prisma } from './prisma.js';
import { localDate, startOfLocalDay } from './date.js';

/**
 * Incentive engine.
 *  - Rules are set by Admin (IncentiveRule) and evaluated per calendar month.
 *  - A deal = visit with status DEAL_DONE, counted in the month of `dealClosedAt`.
 *  - FIELD_VISITOR rules use the employee's own deals.
 *  - MANAGER rules use team deals: the manager's own leads + all employees reporting to them.
 */

import { evaluateRule } from './incentiveMath.js';

export { RULE_TYPES, evaluateRule, dealMatches } from './incentiveMath.js';

const round2 = (n) => Math.round(n * 100) / 100;

export const monthRange = (month) => {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last, gte: startOfLocalDay(first), lt: startOfLocalDay(next) };
};
export const isMonth = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const currentMonth = () => localDate().slice(0, 7);

/** Active rules that overlap the month */
export async function rulesForMonth(month) {
  const { first, last } = monthRange(month);
  return prisma.incentiveRule.findMany({
    where: {
      isActive: true,
      AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: last } }] }, { OR: [{ effectiveTo: null }, { effectiveTo: { gte: first } }] }],
    },
    include: { plan: { select: { name: true } }, product: { select: { name: true } }, category: { select: { name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * Compute incentives for a set of users (FIELD_VISITOR / MANAGER) for one month.
 * Returns [{ user, deals, amount, total, lines:[...], payout }]
 */
export async function computeIncentives({ month, userIds }) {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, role: { in: ['FIELD_VISITOR', 'MANAGER'] } },
    select: { id: true, name: true, role: true, isActive: true, managerId: true, manager: { select: { name: true } } },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  if (!users.length) return [];
  const managerIds = users.filter((u) => u.role === 'MANAGER').map((u) => u.id);
  const reports = managerIds.length
    ? await prisma.user.findMany({ where: { managerId: { in: managerIds } }, select: { id: true, managerId: true } })
    : [];
  const ownerIds = [...new Set([...users.map((u) => u.id), ...reports.map((r) => r.id)])];
  const { gte, lt } = monthRange(month);

  const [rawDeals, rules, payouts] = await Promise.all([
    prisma.visit.findMany({
      where: { status: 'DEAL_DONE', dealClosedAt: { gte, lt }, userId: { in: ownerIds } },
      select: { userId: true, dealValue: true, planId: true, productId: true, categoryId: true, dealClosedAt: true },
    }),
    rulesForMonth(month),
    prisma.incentivePayout.findMany({ where: { month, userId: { in: users.map((u) => u.id) } }, include: { paidBy: { select: { name: true } } } }),
  ]);

  const byOwner = {};
  for (const d of rawDeals) {
    (byOwner[d.userId] ||= []).push({ ...d, dealValue: Number(d.dealValue || 0), closedDay: localDate(d.dealClosedAt) });
  }
  const teamOf = {};
  for (const r of reports) (teamOf[r.managerId] ||= []).push(r.id);
  const payoutBy = Object.fromEntries(payouts.map((p) => [p.userId, p]));

  return users.map((u) => {
    const deals = u.role === 'MANAGER' ? [u.id, ...(teamOf[u.id] || [])].flatMap((id) => byOwner[id] || []) : byOwner[u.id] || [];
    const lines = rules
      .filter((r) => r.appliesTo === u.role)
      .map((r) => ({
        ruleId: r.id,
        name: r.name,
        type: r.type,
        filter: [r.plan?.name, r.product?.name, r.category?.name].filter(Boolean).join(' · ') || 'All deals',
        ...evaluateRule(r, deals),
      }));
    const total = round2(lines.reduce((a, l) => a + l.earned, 0));
    const p = payoutBy[u.id];
    return {
      user: { id: u.id, name: u.name, role: u.role, isActive: u.isActive, manager: u.manager?.name || null },
      basis: u.role === 'MANAGER' ? 'team' : 'own',
      deals: deals.length,
      amount: round2(deals.reduce((a, d) => a + d.dealValue, 0)),
      total,
      lines,
      payout: p ? { id: p.id, amount: Number(p.amount), calculated: Number(p.calculated), note: p.note, paidAt: p.paidAt, paidBy: p.paidBy?.name || null } : null,
    };
  });
}
