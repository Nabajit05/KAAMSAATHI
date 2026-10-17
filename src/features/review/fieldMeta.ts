import type { CheckType, FactValue, FieldKey } from "@/domain/facts";
import { FIELD_DEFS } from "@/domain/facts";
import { formatINR } from "@/domain/money";
import { formatDateLabel } from "@/locales";
import type { Locale } from "@/domain/case";

export interface FieldGroup {
  titleKey: string;
  fields: FieldKey[];
}

export const GROUPS: Record<CheckType, FieldGroup[]> = {
  incentive: [
    {
      titleKey: "review.groupOffer",
      fields: ["offer_date", "offer_threshold_orders", "offer_amount", "offer_conditions_visible", "offer_tier2_threshold_orders", "offer_tier2_amount", "offer_tier_mode"],
    },
    { titleKey: "review.groupActivity", fields: ["activity_date", "condition_zone_shift", "qualifying_orders"] },
    { titleKey: "review.groupPayment", fields: ["incentive_credited", "incentive_pending"] },
  ],
  settlement: [
    {
      titleKey: "review.groupSettlement",
      fields: ["base_earnings", "incentive_earned", "tips_in_app", "earnings_adjustment", "cash_retained", "advance_offset", "unclassified_deduction", "bank_settlement", "settlement_status"],
    },
    { titleKey: "review.groupExpenses", fields: ["fuel_expense", "other_expense"] },
  ],
  daily_wage: [
    {
      titleKey: "review.groupWage",
      fields: ["agreed_daily_rate", "full_days_confirmed", "half_days_confirmed", "days_unconfirmed", "payments_received", "advances_received"],
    },
  ],
};

export const ENUM_OPTIONS: Partial<Record<string, Array<{ value: string; labelKey: string }>>> = {
  tri: [
    { value: "met", labelKey: "review.tri_met" },
    { value: "not_met", labelKey: "review.tri_not_met" },
  ],
  tier_mode: [
    { value: "single", labelKey: "review.tier_single" },
    { value: "highest_only", labelKey: "review.tier_highest_only" },
    { value: "stacking", labelKey: "review.tier_stacking" },
  ],
  settlement_status: [
    { value: "settled", labelKey: "review.status_settled" },
    { value: "pending", labelKey: "review.status_pending" },
    { value: "partial", labelKey: "review.status_partial" },
  ],
};

export function formatFactValue(key: FieldKey, value: FactValue, locale: Locale, t: (k: string) => string): string {
  if (value === null) return t("app.unknown");
  const kind = FIELD_DEFS[key].kind;
  switch (kind) {
    case "money":
    case "signed_money":
      return typeof value === "number" ? formatINR(value, { signed: kind === "signed_money" && value !== 0 }) : String(value);
    case "count":
      return String(value);
    case "date":
      return formatDateLabel(String(value), locale);
    case "tri":
      return t(`review.tri_${value}`);
    case "tier_mode":
      return t(`review.tier_${value}`);
    case "settlement_status":
      return t(`review.status_${value}`);
  }
}
