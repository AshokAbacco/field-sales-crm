// Mirror of server/src/lib/incentiveMath.js – keep both in sync (used for the live preview in the rule editor)
/** Pure incentive maths – no database access (unit-testable, also mirrored in the admin rule preview). */
export const RULE_TYPES = {
  PER_DEAL: { needsEvery: false, label: 'Fixed ₹ per deal' },
  PERCENT_OF_AMOUNT: { needsEvery: false, label: '% of plan amount' },
  PER_DEAL_COUNT: { needsEvery: true, label: '₹ for every N deals' },
  PER_AMOUNT_SLAB: { needsEvery: true, label: '₹ for every ₹X sold' },
  DEAL_TARGET_BONUS: { needsEvery: true, label: 'Bonus at N deals' },
  REVENUE_TARGET_BONUS: { needsEvery: true, label: 'Bonus at ₹X sold' },
};

const round2 = (n) => Math.round(n * 100) / 100;
const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Does a deal match the rule's filters and validity window? */
export function dealMatches(rule, deal) {
  if (rule.planId && deal.planId !== rule.planId) return false;
  if (rule.productId && deal.productId !== rule.productId) return false;
  if (rule.categoryId && deal.categoryId !== rule.categoryId) return false;
  const day = deal.closedDay;
  if (rule.effectiveFrom && day < rule.effectiveFrom) return false;
  if (rule.effectiveTo && day > rule.effectiveTo) return false;
  return true;
}

/**
 * Pure calculation for one rule over a set of deals.
 * deals: [{ dealValue:number, planId, productId, categoryId, closedDay:'YYYY-MM-DD' }]
 * returns { deals, amount, earned, explain }
 */
export function evaluateRule(rule, deals) {
  const matched = deals.filter((d) => dealMatches(rule, d));
  const n = matched.length;
  const amount = round2(matched.reduce((a, d) => a + (Number(d.dealValue) || 0), 0));
  const rate = Number(rule.rate) || 0;
  const every = Number(rule.every) || 0;
  let earned = 0;
  let explain = '';

  if (rule.minDeals && n < rule.minDeals) {
    return { deals: n, amount, earned: 0, explain: `Needs at least ${rule.minDeals} deals (has ${n})` };
  }
  switch (rule.type) {
    case 'PER_DEAL':
      earned = n * rate;
      explain = `${n} deal${n === 1 ? '' : 's'} × ${inr(rate)}`;
      break;
    case 'PERCENT_OF_AMOUNT':
      earned = (amount * rate) / 100;
      explain = `${rate}% of ${inr(amount)}`;
      break;
    case 'PER_DEAL_COUNT': {
      const blocks = every > 0 ? Math.floor(n / every) : 0;
      earned = blocks * rate;
      explain = `${n} deals → ${blocks} × (${every} deals = ${inr(rate)})`;
      break;
    }
    case 'PER_AMOUNT_SLAB': {
      const blocks = every > 0 ? Math.floor(amount / every) : 0;
      earned = blocks * rate;
      explain = `${inr(amount)} → ${blocks} × (${inr(every)} = ${inr(rate)})`;
      break;
    }
    case 'DEAL_TARGET_BONUS':
      earned = every > 0 && n >= every ? rate : 0;
      explain = earned ? `Target ${every} deals reached (${n})` : `${n} / ${every} deals – target not reached`;
      break;
    case 'REVENUE_TARGET_BONUS':
      earned = every > 0 && amount >= every ? rate : 0;
      explain = earned ? `Target ${inr(every)} reached (${inr(amount)})` : `${inr(amount)} / ${inr(every)} – target not reached`;
      break;
    default:
      explain = 'Unknown rule type';
  }
  const cap = rule.maxPayout != null ? Number(rule.maxPayout) : null;
  if (cap != null && earned > cap) {
    earned = cap;
    explain += ` · capped at ${inr(cap)}`;
  }
  return { deals: n, amount, earned: round2(earned), explain };
}

