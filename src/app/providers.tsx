"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/domain/case";
import { LOCALE_COOKIE, translate } from "@/locales";
import { authConfigured } from "@/lib/publicConfig";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { clearDeviceData, readPref, writePref } from "@/lib/devicePrefs";

type T = (key: string, params?: Record<string, string | number>) => string;

interface LocaleCtx {
  locale: Locale;
  t: T;
  setLocale: (l: Locale) => void;
}

interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
}

interface AuthCtx {
  configured: boolean;
  loading: boolean;
  user: AuthUser | null;
  signOut: () => Promise<void>;
}

interface PrefsCtx {
  sharedDevice: boolean;
  setSharedDevice: (v: boolean) => void;
}

const LocaleContext = createContext<LocaleCtx | null>(null);
const AuthContext = createContext<AuthCtx | null>(null);
const AnnounceContext = createContext<(msg: string) => void>(() => {});
const PrefsContext = createContext<PrefsCtx | null>(null);

export function useT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("LocaleProvider missing");
  return ctx;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("PrefsProvider missing");
  return ctx;
}

/** Polite, restrained announcements for status changes (upload, read, save). */
export function useAnnounce() {
  return useContext(AnnounceContext);
}

export function Providers({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(authConfigured);
  const [sharedDevice, setSharedDeviceState] = useState(false);
  const [message, setMessage] = useState("");
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l);
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      router.refresh();
    },
    [router],
  );

  const t = useCallback<T>((key, params) => translate(locale, key, params), [locale]);

  useEffect(() => {
    setSharedDeviceState(readPref("sharedDevice") === "1");
  }, []);

  const setSharedDevice = useCallback((v: boolean) => {
    setSharedDeviceState(v);
    if (v) clearDeviceData({ keepPrefs: true });
    writePref("sharedDevice", v ? "1" : "0");
  }, []);

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    let active = true;
    sb.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ? { id: data.user.id, phone: data.user.phone || null, email: data.user.email || null } : null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, phone: session.user.phone || null, email: session.user.email || null } : null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // On a shared phone, end the session when the tab is closed.
  useEffect(() => {
    if (!sharedDevice || !user) return;
    const onHide = () => {
      supabaseBrowser()?.auth.signOut({ scope: "local" });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [sharedDevice, user]);

  const signOut = useCallback(async () => {
    await supabaseBrowser()?.auth.signOut();
    clearDeviceData({ keepPrefs: true });
    setUser(null);
    router.push("/");
    router.refresh();
  }, [router]);

  const announce = useCallback((msg: string) => {
    // Clear first so repeating the same message is announced again.
    setMessage("");
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setMessage(msg), 50);
  }, []);

  const localeValue = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);
  const authValue = useMemo(() => ({ configured: authConfigured, loading, user, signOut }), [loading, user, signOut]);
  const prefsValue = useMemo(() => ({ sharedDevice, setSharedDevice }), [sharedDevice, setSharedDevice]);

  return (
    <LocaleContext.Provider value={localeValue}>
      <AuthContext.Provider value={authValue}>
        <PrefsContext.Provider value={prefsValue}>
          <AnnounceContext.Provider value={announce}>
            {children}
            <div aria-live="polite" role="status" className="sr-only">
              {message}
            </div>
          </AnnounceContext.Provider>
        </PrefsContext.Provider>
      </AuthContext.Provider>
    </LocaleContext.Provider>
  );
}
