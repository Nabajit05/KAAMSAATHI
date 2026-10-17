import { FIELD_DEFS, fieldsForCheck, money, num, str, strengthOf, type FactSet, type FieldKey, type Tri, type TierMode } from "./facts";
import { sumPaise, type Paise } from "./money";
import type { CalcStep, CheckResult, Reason } from "./result";

export const INCENTIVE_RULE_VERSION = "incentive-v1";

export interface Tier {
  minOrders: number;
  amount: Paise;
}

/**
 * Three-valued eligibility for an order-count incentive.
 * A missing condition is "unknown", never assumed met.
 */
export function evaluateTier(orders: number | null, tier: Tier): Tri {
  if (orders === null) return "unknown";
  return orders >= tier.minOrders ? "met" : "not_met";
}

export function combineTri(values: Tri[]): Tri {
  if (values.includes("not_met")) return "not_met";
  if (values.includes("unknown")) return "unknown";
  return "met";
}

/**
 * Expected incentive for confirmed tiers. "highest_only" pays the single
 * highest tier reached; "stacking" adds every tier reached. Returns null when
 * the tier mode matters but is unknown.
 */
export function expectedIncentive(orders: number, tiers: Tier[], mode: TierMode | null): Paise | null {
  const reached = tiers.filter((t) => orders >= t.minOrders).sort((a, b) => a.minOrders - b.minOrders);
  if (reached.length === 0) return 0;
  if (reached.length === 1) return reached[0].amount;
  if (mode === "stacking") return sumPaise(...reached.map((t) => t.amount));
  if (mode === "highest_only" || mode === "single") return reached[reached.length - 1].amount;
  return null;
}

function triFact(facts: FactSet, key: FieldKey): Tri {
  const v = str(facts[key]);
  return v === "met" || v === "not_met" ? v : "unknown";
}

export function checkIncentive(facts: FactSet, inputRevision: number): CheckResult {
  const used = fieldsForCheck("incentive");
  const missing = used.filter((k) => FIELD_DEFS[k].critical && facts[k]?.value == null);
  const reasons: Reason[] = [];
  const steps: CalcStep[] = [];

  const threshold = num(facts.offer_threshold_orders);
  const amount = money(facts.offer_amount);
  const t2Threshold = num(facts.offer_tier2_threshold_orders);
  const t2Amount = money(facts.offer_tier2_amount);
  const tierMode = (str(facts.offer_tier_mode) as TierMode | null) ?? (t2Threshold === null ? "single" : null);
  const orders = num(facts.qualifying_orders);
  const credited = money(facts.incentive_credited);
  const pending = money(facts.incentive_pending);
  const offerDate = str(facts.offer_date);
  const activityDate = str(facts.activity_date);
  const visible = triFact(facts, "offer_conditions_visible");
  const zoneShift = triFact(facts, "condition_zone_shift");
  const strength = strengthOf(facts, used);

  const base = {
    checkType: "incentive" as const,
    ruleVersion: INCENTIVE_RULE_VERSION,
    inputRevision,
    usedFields: used,
    strength,
    extras: {},
  };

  const moreInfo = (primary: Reason, extraMissing: FieldKey[] = []): CheckResult => ({
    ...base,
    outcome: "more_info_needed",
    expectedPaise: null,
    observedPaise: credited,
    differencePaise: null,
    primary,
    reasons: [primary, ...reasons],
    steps,
    missing: Array.from(new Set([...missing, ...extraMissing])),
  });

  // Activity must be for the same period as the offer.
  if (offerDate && activityDate && offerDate !== activityDate) {
    return moreInfo({ code: "dates_differ", params: { offerDate, activityDate } });
  }
  if (!offerDate || !activityDate) {
    return moreInfo({ code: "missing_fields" }, [!offerDate ? "offer_date" : "activity_date"]);
  }
  if (threshold === null || amount === null || orders === null) {
    return moreInfo({ code: "missing_fields" });
  }

  const tiers: Tier[] = [{ minOrders: threshold, amount }];
  if (t2Threshold !== null && t2Amount !== null) tiers.push({ minOrders: t2Threshold, amount: t2Amount });
  const lowest = Math.min(...tiers.map((t) => t.minOrders));

  steps.push({ label: "qualifying_orders", amount: null, count: orders, op: "info", fields: ["qualifying_orders"] });
  steps.push({ label: "offer_threshold", amount: null, count: threshold, op: "≥", fields: ["offer_threshold_orders"] });

  // Threshold not reached: no incentive is established, whatever the other conditions say.
  if (orders < lowest) {
    const primary: Reason =
      credited !== null && credited > 0
        ? { code: "threshold_not_met_but_credited", params: { orders, threshold: lowest } }
        : { code: "threshold_not_met", params: { orders, threshold: lowest } };
    if (strength === "worker_only") reasons.push({ code: "worker_entered_only" });
    return {
      ...base,
      outcome: "records_match",
      expectedPaise: 0,
      observedPaise: credited,
      differencePaise: null,
      primary,
      reasons: [primary, ...reasons],
      steps,
      missing: [],
    };
  }

  // Threshold reached. Every other condition must be known before we compare.
  if (visible !== "met") return moreInfo({ code: "conditions_not_fully_visible" }, ["offer_conditions_visible"]);
  if (zoneShift === "unknown") return moreInfo({ code: "condition_unknown" }, ["condition_zone_shift"]);
  if (zoneShift === "not_met") {
    const primary: Reason = { code: "condition_not_met" };
    return {
      ...base,
      outcome: "records_match",
      expectedPaise: 0,
      observedPaise: credited,
      differencePaise: null,
      primary,
      reasons: [primary],
      steps,
      missing: [],
    };
  }

  const expected = expectedIncentive(orders, tiers, tierMode);
  if (expected === null) return moreInfo({ code: "tier_mode_unknown" }, ["offer_tier_mode"]);
  if (credited === null) return moreInfo({ code: "missing_fields" }, ["incentive_credited"]);
  if (pending === null) return moreInfo({ code: "missing_fields" }, ["incentive_pending"]);

  const observed = sumPaise(credited, pending);
  const difference = expected - observed;
  steps.push({ label: "expected_incentive", amount: expected, op: "=", fields: ["offer_amount"] });
  steps.push({ label: "incentive_credited", amount: credited, op: "−", fields: ["incentive_credited"] });
  if (pending !== 0) steps.push({ label: "incentive_pending", amount: pending, op: "−", fields: ["incentive_pending"] });
  steps.push({ label: "difference", amount: difference, op: "=", fields: [] });

  if (strength === "worker_only") reasons.push({ code: "worker_entered_only" });

  let primary: Reason;
  let outcome: CheckResult["outcome"];
  if (difference > 0) {
    outcome = "possible_difference";
    primary = { code: "threshold_met_paid_less", params: { orders, threshold, expected, credited, difference } };
  } else if (difference === 0) {
    outcome = "records_match";
    primary =
      pending > 0
        ? { code: "pending_payment_covers_difference", params: { pending } }
        : { code: "threshold_met_paid_in_full", params: { expected } };
  } else {
    outcome = "records_match";
    primary = { code: "threshold_met_paid_more", params: { expected, credited } };
  }

  return {
    ...base,
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
