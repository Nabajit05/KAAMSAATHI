/**
 * Money is always integer paise (1 INR = 100 paise). Never use binary
 * floating point for arithmetic; parsing works on the decimal string.
 */

export type Paise = number;

/** ₹1 crore. Larger single values are rejected as implausible for a gig payout record. */
export const MAX_ABS_PAISE: Paise = 1_00_00_000 * 100;

export type MoneyParseError =
  | "empty"
  | "invalid_format"
  | "too_many_decimals"
  | "out_of_range"
  | "negative_not_allowed"
  | "unsupported_currency";

export type MoneyParseResult =
  | { ok: true; paise: Paise }
  | { ok: false; error: MoneyParseError };

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** Converts Devanagari digits to ASCII so "₹१,२००" parses like "₹1,200". */
export function normalizeDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const idx = DEVANAGARI_DIGITS.indexOf(ch);
    out += idx >= 0 ? String(idx) : ch;
  }
  return out;
}

/**
 * Parses a worker- or document-supplied INR amount.
 * Accepts "1200", "1,200.50", "1,00,000", "₹ 600", "Rs. 600", "INR 600", "-300", "१२००".
 * Rejects other currency symbols, exponents, more than two decimals and ambiguous separators.
 */
export function parseMoney(
  raw: string,
  opts: { allowNegative?: boolean } = {},
): MoneyParseResult {
  let s = normalizeDigits(raw).trim();
  if (s === "") return { ok: false, error: "empty" };

  if (/[$€£¥]|usd|eur|gbp/i.test(s)) return { ok: false, error: "unsupported_currency" };

  let negative = false;
  // Allow sign before or after the currency marker: "-₹300" or "₹-300".
  s = s.replace(/^[−–]/, "-");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  }
  s = s.replace(/^(₹|rs\.?|inr)\s*/i, "");
  s = s.replace(/^[−–]/, "-");
  if (s.startsWith("-")) {
    if (negative) return { ok: false, error: "invalid_format" };
    negative = true;
    s = s.slice(1).trim();
  }
  s = s.replace(/\s*\/-$/, ""); // "600/-" is a common Indian notation

  if (!/^\d[\d,]*(\.\d+)?$/.test(s)) return { ok: false, error: "invalid_format" };

  const [intPartRaw, decPart = ""] = s.split(".");
  if (intPartRaw.includes(",")) {
    // Indian (1,00,000) or international (100,000) grouping only; no empty groups.
    const indian = /^\d{1,2}(,\d{2})*,\d{3}$/;
    const intl = /^\d{1,3}(,\d{3})+$/;
    if (!indian.test(intPartRaw) && !intl.test(intPartRaw)) {
      return { ok: false, error: "invalid_format" };
    }
  }
  if (decPart.length > 2) return { ok: false, error: "too_many_decimals" };

  const intDigits = intPartRaw.replace(/,/g, "");
  if (intDigits.length > 12) return { ok: false, error: "out_of_range" };

  const paiseAbs = Number(intDigits) * 100 + Number(decPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(paiseAbs) || paiseAbs > MAX_ABS_PAISE) {
    return { ok: false, error: "out_of_range" };
  }
  if (negative && !opts.allowNegative) return { ok: false, error: "negative_not_allowed" };

  return { ok: true, paise: negative && paiseAbs !== 0 ? -paiseAbs : paiseAbs };
}

export function isValidPaise(value: unknown): value is Paise {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= MAX_ABS_PAISE
  );
}

/** Adds integer paise, throwing if inputs are not safe integers (programming error). */
export function sumPaise(...values: Paise[]): Paise {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new RangeError("Non-integer paise value");
    total += v;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError("Paise overflow");
  return total;
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) groups.unshift(rest);
  return `${groups.join(",")},${last3}`;
}

/**
 * Formats paise as "₹1,00,000" or "₹1,200.50" using Indian grouping.
 * Pure string formatting; no float conversion. Latin digits are used in both
 * languages because payout screens and bank SMS use them.
 */
export function formatINR(paise: Paise, opts: { signed?: boolean } = {}): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = groupIndian(String(rupees)) + (rem ? `.${String(rem).padStart(2, "0")}` : "");
  const sign = negative ? "−" : opts.signed && paise > 0 ? "+" : "";
  return `${sign}₹${body}`;
}

/** Plain rupee string for editable inputs: 120050 -> "1200.50". */
export function paiseToInput(paise: Paise): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${negative ? "-" : ""}${rupees}${rem ? `.${String(rem).padStart(2, "0")}` : ""}`;
}

export const rupees = (r: number): Paise => {
  if (!Number.isSafeInteger(r)) throw new RangeError("rupees() expects whole rupees");
  return r * 100;
};
