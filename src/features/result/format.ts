import type { Locale } from "@/domain/case";
import { formatINR } from "@/domain/money";
import type { Reason } from "@/domain/result";
import { formatDateLabel } from "@/locales";

const MONEY_PARAMS = new Set(["expected", "credited", "difference", "observed", "pending", "cash", "advance", "earned", "received", "balance", "amount"]);
const DATE_PARAMS = new Set(["offerDate", "activityDate"]);

export function reasonText(r: Reason, locale: Locale, t: (k: string, p?: Record<string, string | number>) => string): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r.params ?? {})) {
    if (MONEY_PARAMS.has(k) && typeof v === "number") params[k] = formatINR(v);
    else if (DATE_PARAMS.has(k)) params[k] = formatDateLabel(String(v), locale);
    else params[k] = v;
  }
  return t(`reason.${r.code}`, params);
}
