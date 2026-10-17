"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, useT } from "@/app/providers";
import { Icon, type IconName } from "./Icon";

const NAV: Array<{ href: string; key: string; icon: IconName }> = [
  { href: "/home", key: "nav.home", icon: "home" },
  { href: "/earnings", key: "nav.earnings", icon: "wallet" },
  { href: "/cases", key: "nav.cases", icon: "folder" },
  { href: "/help", key: "nav.help", icon: "help" },
];

export function LanguageToggle({ tone = "default" }: { tone?: "default" | "light" }) {
  const { locale, setLocale, t } = useT();
  const next = locale === "en" ? "hi" : "en";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      lang={next}
      className={`inline-flex min-h-11 min-w-0 items-center gap-1.5 text-left rounded-full px-2.5 text-sm font-semibold leading-tight sm:px-3 ${
        tone === "light" ? "focus-ring-light bg-white/10 text-white hover:bg-white/20" : "bg-surface text-ink shadow-[var(--shadow-card)] hover:bg-sunken"
      }`}
    >
      <Icon name="globe" size={18} />
      {t("app.switchTo")}
    </button>
  );
}

function AccountButton() {
  const { t } = useT();
  return (
    <Link
      href="/settings"
      aria-label={t("nav.account")}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-[var(--shadow-card)] hover:bg-sunken"
    >
      <Icon name="user" />
    </Link>
  );
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function OfflineBanner() {
  const { t } = useT();
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="no-print flex items-center gap-2 bg-deep px-4 py-2 text-sm text-white">
      <Icon name="wifiOff" size={18} />
      {t("app.offline")}
    </div>
  );
}

export function DemoBanner() {
  const { t } = useT();
  return (
    <p className="flex items-center gap-2 rounded-full bg-attention px-3 py-1.5 text-sm font-semibold text-attention-ink">
      <Icon name="info" size={16} />
      {t("app.demoBanner")}
    </p>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <nav aria-label={t("nav.label")} className="no-print fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
      <ul className="mx-auto flex max-w-md items-stretch justify-between gap-1 rounded-full bg-surface p-1.5 shadow-[var(--shadow-float)] ring-1 ring-border backdrop-blur-0">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center rounded-full px-1 text-xs font-semibold leading-tight ${
                  active ? "bg-primary text-white" : "text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                <Icon name={item.icon} size={22} />
                <span className="mt-0.5">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Page frame. "top" pages show the brand header with language and account;
 * "task" pages show back + centered title and hide the bottom nav so the
 * worker can focus, with an explicit exit path.
 */
export function AppShell({
  children,
  variant = "top",
  title,
  backHref,
  demo = false,
  aside,
  wide = false,
}: {
  children: ReactNode;
  variant?: "top" | "task";
  title?: string;
  backHref?: string;
  demo?: boolean;
  aside?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const { user } = useAuth();
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded-full bg-primary px-4 py-2 text-white">
        {t("app.skip")}
      </a>
      <OfflineBanner />
      <header className="no-print mx-auto flex w-full max-w-5xl items-center gap-2 px-4 pb-2 pt-4 sm:gap-3 sm:px-6">
        {variant === "task" ? (
          <>
            <button
              type="button"
              onClick={() => (backHref ? router.push(backHref) : router.back())}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-sunken"
              aria-label={t("app.back")}
            >
              <Icon name="back" />
            </button>
            <p className="min-w-0 flex-1 text-center text-base font-semibold leading-tight sm:text-lg">{title}</p>
            <LanguageToggle />
          </>
        ) : (
          <>
            <Link href={user ? "/home" : "/"} className="flex min-h-11 shrink-0 items-center gap-2 text-base font-bold tracking-tight text-ink sm:text-lg">
              <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                <Icon name="check" size={20} strokeWidth={2.6} />
              </span>
              {t("app.name")}
            </Link>
            <span className="flex-1" />
            <LanguageToggle />
            <AccountButton />
          </>
        )}
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={`mx-auto w-full px-4 pb-32 pt-2 sm:px-6 ${wide ? "max-w-5xl" : "max-w-xl"} ${aside ? "lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8" : ""}`}
      >
        {demo ? (
          <div className="no-print mb-3 lg:col-span-full">
            <DemoBanner />
          </div>
        ) : null}
        <div className="min-w-0">{children}</div>
        {aside ? <aside className="mt-6 min-w-0 lg:mt-0">{aside}</aside> : null}
      </main>
      {variant === "top" ? <BottomNav /> : null}
    </div>
  );
}
