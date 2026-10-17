/**
 * Browser storage helpers. Only per-device conveniences and explicitly
 * consented drafts live here — never auth tokens, raw records or audio.
 * Every access is guarded because storage can be blocked or throw.
 */

const PREFIX = "hc_";
const PREF_KEYS = ["sharedDevice", "welcomeSeen"] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

export function readPref(key: PrefKey): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writePref(key: PrefKey, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage unavailable: preference lasts for this page only */
  }
}

interface Stored<T> {
  value: T;
  expiresAt: number;
}

/** Consented device storage with expiry. Returns null when expired or unavailable. */
export function readStored<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeStored<T>(key: string, value: T, ttlDays = 7): boolean {
  try {
    if (readPref("sharedDevice") === "1") return false;
    const payload: Stored<T> = { value, expiresAt: Date.now() + ttlDays * 86_400_000 };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to remove */
  }
}

/** Removes every HaqCheck item from this browser (logout, delete, shared-phone mode). */
export function clearDeviceData(opts: { keepPrefs?: boolean } = {}): void {
  try {
    const keep = new Set(opts.keepPrefs ? PREF_KEYS.map((k) => PREFIX + k) : []);
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX) && !keep.has(k)) window.localStorage.removeItem(k);
    }
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) window.sessionStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}
