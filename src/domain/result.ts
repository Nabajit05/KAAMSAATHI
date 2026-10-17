import type { FieldKey, CheckType } from "./facts";
import type { Paise } from "./money";

export type Outcome = "records_match" | "possible_difference" | "more_info_needed";

/**
 * Reasons are codes plus parameters, rendered by the UI in the worker's
 * language. Keeping them structured lets us validate generated text against
 * the same numbers.
 */
export type ReasonCode =
  // incentive
  | "threshold_met_paid_less"
  | "threshold_met_paid_in_full"
  | "threshold_met_paid_more"
  | "threshold_not_met"
  | "threshold_not_met_but_credited"
  | "condition_not_met"
  | "condition_unknown"
  | "conditions_not_fully_visible"
  | "dates_differ"
  | "tier_mode_unknown"
  | "pending_payment_covers_difference"
  // settlement
  | "settlement_matches"
  | "settlement_less_than_expected"
  | "settlement_more_than_expected"
  | "settlement_pending"
  | "unclassified_deduction"
  | "advance_is_not_lost_earnings"
  | "cash_retained_explained"
  | "expenses_incomplete"
  // daily wage
  | "wage_balance_due"
  | "wage_fully_paid"
  | "wage_overpaid"
  | "unconfirmed_days_excluded"
  | "half_day_rounding"
  // shared
  | "missing_fields"
  | "worker_entered_only";

export interface Reason {
  code: ReasonCode;
  params?: Record<string, string | number>;
}

/** One line of "How we checked". Amounts are signed contributions to the total. */
export interface CalcStep {
  label: string; // i18n key under "calc."
  amount: Paise | null;
  count?: number | null;
  op: "+" | "−" | "=" | "≥" | "×" | "info";
  fields: FieldKey[];
}

export interface CheckResult {
  checkType: CheckType;
  outcome: Outcome;
  ruleVersion: string;
  inputRevision: number;
  expectedPaise: Paise | null;
  observedPaise: Paise | null;
  /** expected − observed, only when both sides are supported by confirmed facts. */
  differencePaise: Paise | null;
  primary: Reason;
  reasons: Reason[];
  steps: CalcStep[];
  missing: FieldKey[];
  usedFields: FieldKey[];
  strength: "records" | "mixed" | "worker_only";
  /** Extra non-earnings figures, e.g. net after recorded expenses. */
  extras: Record<string, Paise | null>;
}
