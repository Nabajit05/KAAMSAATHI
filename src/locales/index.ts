import en, { type Messages } from "./en";
import hi from "./hi";
import type { Locale } from "@/domain/case";

export type { Messages };
export const LOCALES: Locale[] = ["en", "hi"];
export const LOCALE_COOKIE = "hc_locale";

const dictionaries: Record<Locale, Messages> = { en, hi };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "hi";
}

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

type Params = Record<string, string | number>;

/** Looks up "section.key" and fills {placeholders}. Missing keys return the key, so gaps are visible in QA. */
export function translate(locale: Locale, key: string, params?: Params): string {
  const [section, name] = key.split(".", 2) as [keyof Messages, string];
  const table = dictionaries[locale][section] as Record<string, string> | undefined;
  const template = table?.[name] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, p: string) => (p in params ? String(params[p]) : `{${p}}`));
}

export function formatDateLabel(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  // Construct at noon UTC so the calendar date can't shift with the viewer's timezone.
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(date);
}

export function formatDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    numberingSystem: "latn",
  }).format(new Date(iso));
}
