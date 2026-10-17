import { FIELD_DEFS, fieldsForCheck, money, num, strengthOf, type FactSet, type FieldKey } from "./facts";
import { sumPaise, type Paise } from "./money";
import type { CalcStep, CheckResult, Reason } from "./result";

export const DAILY_WAGE_RULE_VERSION = "daily-wage-v1";

/**
 * earned  = rate × full days + (rate ÷ 2) × half days
 * balance = earned − confirmed payments − confirmed advances
 * Half-day pay on an odd-paise rate rounds half up and is reported.
 * Unconfirmed days are never added; they are reported separately.
 */
export function wageEarned(rate: Paise, fullDays: number, halfDays: number): { earned: Paise; rounded: boolean } {
  if (!Number.isSafeInteger(fullDays) || !Number.isSafeInteger(halfDays) || fullDays < 0 || halfDays < 0) {
    throw new RangeError("Days must be non-negative whole numbers");
  }
  const halfUnits = rate * (2 * fullDays + halfDays); // in half-paise
  const rounded = halfUnits % 2 !== 0;
  return { earned: Math.round(halfUnits / 2), rounded };
}

export function checkDailyWage(facts: FactSet, inputRevision: number): CheckResult {
  const used = fieldsForCheck("daily_wage");
  const missing: FieldKey[] = used.filter((k) => FIELD_DEFS[k].critical && facts[k]?.value == null);
  const rate = money(facts.agreed_daily_rate);
  const full = num(facts.full_days_confirmed);
  const half = facts.half_days_confirmed ? num(facts.half_days_confirmed) : 0;
  const paid = money(facts.payments_received);
  const advances = facts.advances_received ? money(facts.advances_received) : 0;
  const unconfirmed = num(facts.days_unconfirmed) ?? 0;
  const strength = strengthOf(facts, used);
  const reasons: Reason[] = [];
  const steps: CalcStep[] = [];

  const common = {
    checkType: "daily_wage" as const,
    ruleVersion: DAILY_WAGE_RULE_VERSION,
    inputRevision,
    usedFields: used,
    strength,
    extras: {},
  };

  if (rate === null || full === null || half === null || paid === null || advances === null) {
    const primary: Reason = { code: "missing_fields" };
    const extra: FieldKey[] = [];
    if (half === null) extra.push("half_days_confirmed");
    if (advances === null) extra.push("advances_received");
    return {
      ...common,
      outcome: "more_info_needed",
      expectedPaise: null,
      observedPaise: paid,
      differencePaise: null,
      primary,
      reasons: [primary],
      steps,
      missing: Array.from(new Set([...missing, ...extra])),
    };
  }

  const { earned, rounded } = wageEarned(rate, full, half);
  const received = sumPaise(paid, advances);
  const balance = earned - received;

  steps.push({ label: "agreed_daily_rate", amount: rate, op: "info", fields: ["agreed_daily_rate"] });
  steps.push({ label: "full_days", amount: null, count: full, op: "×", fields: ["full_days_confirmed"] });
  if (half) steps.push({ label: "half_days", amount: null, count: half, op: "×", fields: ["half_days_confirmed"] });
  steps.push({ label: "wage_earned", amount: earned, op: "=", fields: [] });
  steps.push({ label: "payments_received", amount: paid, op: "−", fields: ["payments_received"] });
  if (advances) steps.push({ label: "advances_received", amount: advances, op: "−", fields: ["advances_received"] });
  steps.push({ label: "balance", amount: balance, op: "=", fields: [] });

  if (rounded) reasons.push({ code: "half_day_rounding" });
  if (unconfirmed > 0) reasons.push({ code: "unconfirmed_days_excluded", params: { days: unconfirmed } });
  if (strength === "worker_only") reasons.push({ code: "worker_entered_only" });

  let primary: Reason;
  let outcome: CheckResult["outcome"];
  if (balance > 0) {
    outcome = "possible_difference";
    primary = { code: "wage_balance_due", params: { earned, received, balance } };
  } else if (balance === 0) {
    outcome = "records_match";
    primary = { code: "wage_fully_paid", params: { earned } };
  } else {
    outcome = "records_match";
    primary = { code: "wage_overpaid", params: { earned, received } };
  }

  return {
    ...common,
    outcome,
    expectedPaise: earned,
    observedPaise: received,
    differencePaise: balance > 0 ? balance : 0,
    primary,
    reasons: [primary, ...reasons],
    steps,
    missing: [],
  };
}
