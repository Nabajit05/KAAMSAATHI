import { FIELD_DEFS, type FactValue, type FieldKey } from "./facts";
import { normalizeDigits, parseMoney } from "./money";

const ENUMS: Record<string, string[]> = {
  tri: ["met", "not_met", "unknown"],
  tier_mode: ["single", "highest_only", "stacking"],
  settlement_status: ["settled", "pending", "partial"],
};

/**
 * Parses a worker- or extractor-supplied string for a field. Used both for
 * worker edits and to normalise AI extraction output, so the model's numbers
 * are never trusted as-is.
 */
export function parseFieldValue(key: FieldKey, text: string): { ok: true; value: FactValue } | { ok: false; errorKey: string } {
  const kind = FIELD_DEFS[key].kind;
  const trimmed = normalizeDigits(text).trim();
  if (kind === "money" || kind === "signed_money") {
    const r = parseMoney(trimmed, { allowNegative: kind === "signed_money" });
    return r.ok ? { ok: true, value: r.paise } : { ok: false, errorKey: "review.invalidMoney" };
  }
  if (kind === "count") {
    return /^\d{1,6}$/.test(trimmed) ? { ok: true, value: Number(trimmed) } : { ok: false, errorKey: "review.invalidCount" };
  }
  if (kind === "date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!m) return { ok: false, errorKey: "review.invalidDate" };
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const valid = d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
    return valid ? { ok: true, value: trimmed } : { ok: false, errorKey: "review.invalidDate" };
  }
  const allowed = ENUMS[kind] ?? [];
  return allowed.includes(trimmed) ? { ok: true, value: trimmed } : { ok: false, errorKey: "review.invalidDate" };
}
