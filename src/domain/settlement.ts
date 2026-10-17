import { FIELD_DEFS, fieldsForCheck, money, str, strengthOf, type FactSet, type FieldKey } from "./facts";
import { sumPaise, type Paise } from "./money";
import type { CalcStep, CheckResult, Reason } from "./result";

export const SETTLEMENT_RULE_VERSION = "settlement-v1";

/**
 * Documented formula (signed, same period):
 *   gross earnings     = base + earned incentive + in-app tips + earnings adjustment
 *   expected settlement = gross earnings − cash retained (COD) − advance recovery
 * Cash retained and advance recovery are settlement offsets: the worker already
 * holds or previously received that money, so they are not lost earnings.
 * Operating expenses (fuel, rental) are never subtracted from expected payout.
 */
export function grossEarnings(p: { base: Paise; incentive: Paise; tips: Paise; adjustment: Paise }): Paise {
  return sumPaise(p.base, p.incentive, p.tips, p.adjustment);
}

export function expectedSettlement(gross: Paise, cashRetained: Paise, advance: Paise): Paise {
  return sumPaise(gross, -cashRetained, -advance);
}

/** Optional components: absent means not present on the record; explicitly unknown blocks. */
function optional(facts: FactSet, key: FieldKey): { value: Paise; blocked: boolean } {
  const f = facts[key];
  if (!f) return { value: 0, blocked: false };
  const v = money(f);
  if (v === null) return { value: 0, blocked: true };
  return { value: v, blocked: false };
}

export function checkSettlement(facts: FactSet, inputRevision: number): CheckResult {
  const used = fieldsForCheck("settlement");
  const missing: FieldKey[] = used.filter((k) => FIELD_DEFS[k].critical && facts[k]?.value == null);
  const reasons: Reason[] = [];
  const steps: CalcStep[] = [];

  const base = money(facts.base_earnings);
  const incentive = money(facts.incentive_earned);
  const tips = optional(facts, "tips_in_app");
  const adj = optional(facts, "earnings_adjustment");
  const cash = money(facts.cash_retained);
  const advance = money(facts.advance_offset);
  const unclassified = facts.unclassified_deduction ? money(facts.unclassified_deduction) : 0;
  const observed = money(facts.bank_settlement);
  const status = str(facts.settlement_status);
  const fuel = facts.fuel_expense ? money(facts.fuel_expense) : null;
  const other = facts.other_expense ? money(facts.other_expense) : null;
  const strength = strengthOf(facts, used);

  if (tips.blocked) missing.push("tips_in_app");
  if (adj.blocked) missing.push("earnings_adjustment");

  // Net after recorded expenses is an earnings figure, computed independently of payout.
  const extras: Record<string, Paise | null> = { grossEarnings: null, netAfterRecordedExpenses: null };
  if (base !== null && incentive !== null && !tips.blocked && !adj.blocked) {
    const gross = grossEarnings({ base, incentive, tips: tips.value, adjustment: adj.value });
    extras.grossEarnings = gross;
    const recorded = [fuel, other].filter((v): v is Paise => v !== null);
    extras.netAfterRecordedExpenses = recorded.length ? sumPaise(gross, ...recorded.map((v) => -v)) : null;
    if (fuel === null || other === null) reasons.push({ code: "expenses_incomplete" });
  }

  const common = {
    checkType: "settlement" as const,
    ruleVersion: SETTLEMENT_RULE_VERSION,
    inputRevision,
    usedFields: used,
    strength,
    extras,
  };

  const moreInfo = (primary: Reason, extra: FieldKey[] = []): CheckResult => ({
    ...common,
    outcome: "more_info_needed",
    expectedPaise: null,
    observedPaise: observed,
    differencePaise: null,
    primary,
    reasons: [primary, ...reasons],
    steps,
    missing: Array.from(new Set([...missing, ...extra])),
  });

  if (unclassified === null || (unclassified ?? 0) > 0) {
    return moreInfo({ code: "unclassified_deduction", params: { amount: unclassified ?? 0 } }, ["unclassified_deduction"]);
  }
  if (base === null || incentive === null || cash === null || advance === null || tips.blocked || adj.blocked) {
    return moreInfo({ code: "missing_fields" });
  }
  if (status === null || observed === null) return moreInfo({ code: "missing_fields" });
  if (status !== "settled") return moreInfo({ code: "settlement_pending" }, ["settlement_status"]);

  const gross = grossEarnings({ base, incentive, tips: tips.value, adjustment: adj.value });
  const expected = expectedSettlement(gross, cash, advance);
  steps.push({ label: "base_earnings", amount: base, op: "+", fields: ["base_earnings"] });
  steps.push({ label: "incentive_earned", amount: incentive, op: "+", fields: ["incentive_earned"] });
  if (tips.value) steps.push({ label: "tips_in_app", amount: tips.value, op: "+", fields: ["tips_in_app"] });
  if (adj.value) steps.push({ label: "earnings_adjustment", amount: adj.value, op: adj.value < 0 ? "−" : "+", fields: ["earnings_adjustment"] });
  steps.push({ label: "gross_earnings", amount: gross, op: "=", fields: [] });
  steps.push({ label: "cash_retained", amount: cash, op: "−", fields: ["cash_retained"] });
  steps.push({ label: "advance_offset", amount: advance, op: "−", fields: ["advance_offset"] });
  steps.push({ label: "expected_settlement", amount: expected, op: "=", fields: [] });
  steps.push({ label: "bank_settlement", amount: observed, op: "info", fields: ["bank_settlement"] });

  if (cash > 0) reasons.push({ code: "cash_retained_explained", params: { cash } });
  if (advance > 0) reasons.push({ code: "advance_is_not_lost_earnings", params: { advance } });
  if (strength === "worker_only") reasons.push({ code: "worker_entered_only" });

  const difference = expected - observed;
  let primary: Reason;
  let outcome: CheckResult["outcome"];
  if (difference === 0) {
    outcome = "records_match";
    primary = { code: "settlement_matches", params: { expected } };
  } else if (difference > 0) {
    outcome = "possible_difference";
    primary = { code: "settlement_less_than_expected", params: { expected, observed, difference } };
  } else {
    outcome = "records_match";
    primary = { code: "settlement_more_than_expected", params: { expected, observed } };
  }

  return {
    ...common,
    outcome,
    expectedPaise: expected,
    observedPaise: observed,
    differencePaise: difference > 0 ? difference : 0,
    primary,
    reasons: [primary, ...reasons],
    steps,
    missing: [],
  };
}
