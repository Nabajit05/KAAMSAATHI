import type { Paise } from "./money";

/**
 * Where a fact came from. "record" means read from a worker-supplied document
 * (or the fictional sample) and then confirmed by the worker. "worker_entered"
 * means typed by the worker without a document. "worker_stated" is the
 * worker's own account (e.g. from voice intake) and is weaker still.
 */
export type Provenance = "record" | "worker_entered" | "worker_stated";

export type ReviewState =
  | "unreviewed" // extracted, not yet looked at
  | "confirmed" // worker said "yes, correct"
  | "edited" // worker changed the value
  | "unreadable" // extractor could not read it
  | "conflict" // two sources disagree; worker must choose
  | "unknown_confirmed"; // worker said "I don't know"

export type Tri = "met" | "not_met" | "unknown";
export type TierMode = "single" | "highest_only" | "stacking";
export type SettlementStatus = "settled" | "pending" | "partial";

export type FieldKind = "money" | "signed_money" | "count" | "date" | "tri" | "tier_mode" | "settlement_status";

export type CheckType = "incentive" | "settlement" | "daily_wage";

export interface FieldDef {
  kind: FieldKind;
  check: CheckType;
  /** Critical fields must be confirmed (or marked unknown) before a check runs. */
  critical: boolean;
}

export const FIELD_DEFS = {
  // Incentive offer
  offer_date: { kind: "date", check: "incentive", critical: true },
  offer_threshold_orders: { kind: "count", check: "incentive", critical: true },
  offer_amount: { kind: "money", check: "incentive", critical: true },
  offer_tier2_threshold_orders: { kind: "count", check: "incentive", critical: false },
  offer_tier2_amount: { kind: "money", check: "incentive", critical: false },
  offer_tier_mode: { kind: "tier_mode", check: "incentive", critical: false },
  offer_conditions_visible: { kind: "tri", check: "incentive", critical: true },
  condition_zone_shift: { kind: "tri", check: "incentive", critical: true },
  // Activity and payment
  activity_date: { kind: "date", check: "incentive", critical: true },
  qualifying_orders: { kind: "count", check: "incentive", critical: true },
  incentive_credited: { kind: "money", check: "incentive", critical: true },
  incentive_pending: { kind: "money", check: "incentive", critical: true },

  // Settlement
  base_earnings: { kind: "money", check: "settlement", critical: true },
  incentive_earned: { kind: "money", check: "settlement", critical: true },
  tips_in_app: { kind: "money", check: "settlement", critical: false },
  earnings_adjustment: { kind: "signed_money", check: "settlement", critical: false },
  cash_retained: { kind: "money", check: "settlement", critical: true },
  advance_offset: { kind: "money", check: "settlement", critical: true },
  unclassified_deduction: { kind: "money", check: "settlement", critical: false },
  bank_settlement: { kind: "money", check: "settlement", critical: true },
  settlement_status: { kind: "settlement_status", check: "settlement", critical: true },
  fuel_expense: { kind: "money", check: "settlement", critical: false },
  other_expense: { kind: "money", check: "settlement", critical: false },

  // Daily wage
  agreed_daily_rate: { kind: "money", check: "daily_wage", critical: true },
  full_days_confirmed: { kind: "count", check: "daily_wage", critical: true },
  half_days_confirmed: { kind: "count", check: "daily_wage", critical: false },
  days_unconfirmed: { kind: "count", check: "daily_wage", critical: false },
  payments_received: { kind: "money", check: "daily_wage", critical: true },
  advances_received: { kind: "money", check: "daily_wage", critical: false },
} as const satisfies Record<string, FieldDef>;

export type FieldKey = keyof typeof FIELD_DEFS;
export const FIELD_KEYS = Object.keys(FIELD_DEFS) as FieldKey[];

export type FactValue = number | string | null;

export interface FactSource {
  value: FactValue;
  provenance: Provenance;
  sourceDocumentId: string | null;
  sourceExcerpt: string | null;
}

export interface Fact {
  value: FactValue;
  provenance: Provenance | null;
  reviewState: ReviewState;
  sourceDocumentId: string | null;
  /** Short quoted fragment of the source, never a full document. */
  sourceExcerpt: string | null;
  rawText: string | null;
  unknownReason: string | null;
  /** The other value when two sources disagree. Both are preserved. */
  alternative: FactSource | null;
}

export type FactSet = Partial<Record<FieldKey, Fact>>;

export function fieldsForCheck(check: CheckType): FieldKey[] {
  return FIELD_KEYS.filter((k) => FIELD_DEFS[k].check === check);
}

export function emptyFact(): Fact {
  return {
    value: null,
    provenance: null,
    reviewState: "unreviewed",
    sourceDocumentId: null,
    sourceExcerpt: null,
    rawText: null,
    unknownReason: null,
    alternative: null,
  };
}

/** A fact the check may use: reviewed by the worker and holding a value. */
export function isUsable(f: Fact | undefined): f is Fact & { value: number | string } {
  return (
    !!f &&
    f.value !== null &&
    (f.reviewState === "confirmed" || f.reviewState === "edited")
  );
}

export function num(f: Fact | undefined): number | null {
  return isUsable(f) && typeof f.value === "number" ? f.value : null;
}

export function str(f: Fact | undefined): string | null {
  return isUsable(f) && typeof f.value === "string" ? f.value : null;
}

export function money(f: Fact | undefined): Paise | null {
  return num(f);
}

/**
 * Critical fields not yet reviewed. A check cannot run until every critical
 * field is confirmed, edited, or explicitly marked "I don't know".
 */
export function pendingReview(facts: FactSet, check: CheckType): FieldKey[] {
  return fieldsForCheck(check).filter((k) => {
    if (!FIELD_DEFS[k].critical) return false;
    const f = facts[k];
    if (!f) return true;
    return f.reviewState === "unreviewed" || f.reviewState === "conflict" || f.reviewState === "unreadable";
  });
}

/** Provenance summary across used facts, used to label conclusion strength. */
export function strengthOf(facts: FactSet, keys: FieldKey[]): "records" | "mixed" | "worker_only" {
  const used = keys.map((k) => facts[k]).filter(isUsable);
  if (used.length === 0) return "worker_only";
  const fromRecords = used.filter((f) => f.provenance === "record").length;
  if (fromRecords === used.length) return "records";
  if (fromRecords === 0) return "worker_only";
  return "mixed";
}

/** Apply a worker edit. Editing never deletes the extracted source; it keeps it as rawText. */
export function applyWorkerEdit(prev: Fact | undefined, value: FactValue): Fact {
  const base = prev ?? emptyFact();
  const changed = base.value !== value;
  return {
    ...base,
    value,
    reviewState: value === null ? "unknown_confirmed" : changed ? "edited" : "confirmed",
    provenance: changed ? "worker_entered" : base.provenance ?? "worker_entered",
    alternative: null,
  };
}

export function confirmFact(prev: Fact): Fact {
  return { ...prev, reviewState: prev.value === null ? "unknown_confirmed" : "confirmed" };
}

export function markUnknown(prev: Fact | undefined, reason: string | null = null): Fact {
  return { ...(prev ?? emptyFact()), value: null, reviewState: "unknown_confirmed", unknownReason: reason };
}

/** Worker-supplied value disagrees with a document: keep both and require a choice. */
export function recordConflict(docFact: Fact, workerValue: FactValue): Fact {
  if (docFact.value === workerValue) return docFact;
  return {
    ...docFact,
    reviewState: "conflict",
    alternative: { value: workerValue, provenance: "worker_stated", sourceDocumentId: null, sourceExcerpt: null },
  };
}

export function chooseAlternative(f: Fact, useAlternative: boolean): Fact {
  if (!f.alternative) return confirmFact(f);
  if (!useAlternative) return { ...f, reviewState: "confirmed", alternative: null };
  return {
    ...f,
    value: f.alternative.value,
    provenance: f.alternative.provenance,
    sourceDocumentId: f.alternative.sourceDocumentId,
    sourceExcerpt: f.alternative.sourceExcerpt,
    reviewState: "confirmed",
    alternative: null,
  };
}
