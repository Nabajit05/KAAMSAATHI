import type { CaseRecord, Locale } from "./case";
import { formatINR, normalizeDigits, type Paise } from "./money";
import type { CheckResult } from "./result";

/**
 * Everything a complaint may state as a number. Generated drafts are checked
 * against this list; any other number is treated as unsupported.
 */
export interface GroundingFacts {
  amounts: Paise[];
  counts: number[];
  dates: string[]; // YYYY-MM-DD
  identifiers: string[];
}

export function groundingFor(c: CaseRecord): GroundingFacts {
  const amounts = new Set<Paise>();
  const counts = new Set<number>();
  const dates = new Set<string>();
  const ids = new Set<string>();
  for (const f of Object.values(c.facts)) {
    if (!f || f.value === null) continue;
    if (f.reviewState !== "confirmed" && f.reviewState !== "edited") continue;
    if (typeof f.value === "number") {
      amounts.add(f.value);
      counts.add(f.value);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(f.value)) {
      dates.add(f.value);
    }
  }
  const chk = c.check;
  if (chk) {
    for (const v of [chk.expectedPaise, chk.observedPaise, chk.differencePaise, ...Object.values(chk.extras)]) {
      if (typeof v === "number") amounts.add(v);
    }
    for (const s of chk.steps) {
      if (s.amount !== null) amounts.add(s.amount);
      if (typeof s.count === "number") counts.add(s.count);
    }
  }
  for (const d of [c.periodStart, c.periodEnd]) if (d) dates.add(d);
  if (c.submission?.ticketId) ids.add(c.submission.ticketId);
  return { amounts: [...amounts], counts: [...counts], dates: [...dates], identifiers: [...ids] };
}

const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Returns numeric tokens in the text that are not supported by the grounding
 * facts. Money tokens must match a known amount exactly; other numbers must be
 * a known count, a date component, or part of a known identifier.
 */
export function unsupportedNumbers(text: string, g: GroundingFacts): string[] {
  const normalized = normalizeDigits(text);
  const allowedNumbers = new Set<string>();
  for (const a of g.amounts) {
    const abs = Math.abs(a);
    allowedNumbers.add(String(Math.floor(abs / 100)) + (abs % 100 ? `.${String(abs % 100).padStart(2, "0")}` : ""));
    if (abs % 100 === 0) allowedNumbers.add(`${Math.floor(abs / 100)}.00`);
  }
  for (const n of g.counts) allowedNumbers.add(String(n));
  for (const d of g.dates) {
    const [y, m, day] = d.split("-");
    allowedNumbers.add(y);
    allowedNumbers.add(String(Number(m)));
    allowedNumbers.add(m);
    allowedNumbers.add(String(Number(day)));
    allowedNumbers.add(day);
  }
  const idText = g.identifiers.join(" ");

  const bad: string[] = [];
  const tokenRe = /\d[\d,]*(?:\.\d+)?/g;
  for (const m of normalized.matchAll(tokenRe)) {
    const token = m[0].replace(/[.,]+$/, "");
    const plain = token.replace(/,/g, "");
    if (allowedNumbers.has(plain)) continue;
    if (idText.includes(token)) continue;
    // Full ISO dates are tokenised as separate parts by the regex, so nothing else to allow.
    bad.push(token);
  }
  return bad;
}

/** Placeholders the worker fills in; never invented by us. */
export const PLACEHOLDERS = {
  en: { name: "[Your name]", id: "[Your partner ID]" },
  hi: { name: "[आपका नाम]", id: "[आपकी पार्टनर आईडी]" },
} as const;

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return locale === "hi" ? "[तारीख]" : "[date]";
  const [y, m, d] = iso.split("-").map(Number);
  if (locale === "hi") {
    const monthsHi = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
    return `${d} ${monthsHi[m - 1]} ${y}`;
  }
  const month = MONTHS_EN[m - 1];
  return `${d} ${month[0].toUpperCase()}${month.slice(1)} ${y}`;
}

function periodText(c: CaseRecord, locale: Locale): string {
  const start = c.periodStart ?? (typeof c.facts.offer_date?.value === "string" ? c.facts.offer_date.value : null);
  const end = c.periodEnd ?? start;
  if (start && end && start !== end) return `${formatDate(start, locale)} – ${formatDate(end, locale)}`;
  return formatDate(start, locale);
}

/**
 * Deterministic factual draft. Used when AI drafting is unavailable or its
 * output fails validation, and as the "Recorded demo" fallback. It states only
 * confirmed figures and asks for clarification rather than asserting liability.
 */
export function templateComplaint(c: CaseRecord, locale: Locale): string {
  const chk = c.check as CheckResult;
  const p = PLACEHOLDERS[locale];
  const platform = c.platformLabel ?? (locale === "hi" ? "[प्लेटफ़ॉर्म]" : "[platform]");
  const period = periodText(c, locale);
  const refs = c.evidence.filter((e) => e.status === "read" || e.kind === "sample").map((e) => e.filename);
  const exp = chk.expectedPaise !== null ? formatINR(chk.expectedPaise) : null;
  const obs = chk.observedPaise !== null ? formatINR(chk.observedPaise) : null;
  const diff = chk.differencePaise ? formatINR(chk.differencePaise) : null;
  const orders = typeof c.facts.qualifying_orders?.value === "number" ? c.facts.qualifying_orders.value : null;
  const threshold = typeof c.facts.offer_threshold_orders?.value === "number" ? c.facts.offer_threshold_orders.value : null;

  if (locale === "hi") {
    const lines = [
      `विषय: ${period} के भुगतान के बारे में स्पष्टीकरण का अनुरोध`,
      "",
      "नमस्ते सपोर्ट टीम,",
      "",
      `मैं ${platform} पर ${p.name} (पार्टनर आईडी: ${p.id}) के नाम से काम करता/करती हूँ। मैं ${period} के अपने भुगतान के बारे में आपसे स्पष्टीकरण चाहता/चाहती हूँ।`,
      "",
    ];
    if (chk.checkType === "incentive" && orders !== null && threshold !== null) {
      lines.push(`मेरे रिकॉर्ड के अनुसार, ऑफ़र के लिए ${threshold} योग्य ऑर्डर चाहिए थे और मैंने ${orders} योग्य ऑर्डर पूरे किए।`);
    }
    if (chk.checkType === "daily_wage") {
      lines.push("मेरे काम के दिनों और मिले भुगतान का हिसाब नीचे है।");
    }
    if (exp) lines.push(`मेरे पुष्टि किए गए रिकॉर्ड के आधार पर अपेक्षित राशि: ${exp}`);
    if (obs) lines.push(`मिली हुई राशि: ${obs}`);
    if (diff) lines.push(`अंतर: ${diff}`);
    lines.push("");
    if (refs.length) lines.push(`संलग्न रिकॉर्ड: ${refs.join(", ")}`, "");
    lines.push(
      diff
        ? "कृपया इस अंतर की जाँच करें और बताएं कि यह राशि क्यों नहीं मिली। अगर कोई गलती है, तो कृपया इसे ठीक करें।"
        : "कृपया इस भुगतान का हिसाब समझाएं।",
      "",
      "धन्यवाद,",
      p.name,
    );
    return lines.join("\n");
  }

  const lines = [
    `Subject: Request for clarification about my payment for ${period}`,
    "",
    "Hello Support Team,",
    "",
    `I work on ${platform} as ${p.name} (partner ID: ${p.id}). I am writing to ask for clarification about my payment for ${period}.`,
    "",
  ];
  if (chk.checkType === "incentive" && orders !== null && threshold !== null) {
    lines.push(`According to my records, the offer required ${threshold} qualifying orders and I completed ${orders} qualifying orders.`);
  }
  if (chk.checkType === "daily_wage") {
    lines.push("Below is the calculation of my days worked and the payments I received.");
  }
  if (exp) lines.push(`Expected amount, based on the records I confirmed: ${exp}`);
  if (obs) lines.push(`Amount received: ${obs}`);
  if (diff) lines.push(`Difference: ${diff}`);
  lines.push("");
  if (refs.length) lines.push(`Records attached: ${refs.join(", ")}`, "");
  lines.push(
    diff
      ? "Please review this difference and explain why this amount was not paid. If it is an error, please correct it."
      : "Please explain how this payment was calculated.",
    "",
    "Thank you,",
    p.name,
  );
  return lines.join("\n");
}
