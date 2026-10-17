"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { buttonClass } from "@/components/ui";
import { useAuth, useT } from "./providers";
import type { Locale } from "@/domain/case";

const STEPS: Array<{ key: string; icon: IconName }> = [
  { key: "welcome.step1", icon: "image" },
  { key: "welcome.step2", icon: "check" },
  { key: "welcome.step3", icon: "doc" },
];

function LanguageChoice() {
  const { locale, setLocale, t } = useT();
  const options: Array<{ id: Locale; label: string }> = [
    { id: "hi", label: "हिंदी" },
    { id: "en", label: "English" },
  ];
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-white/85">{t("welcome.chooseLanguage")}</legend>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            lang={o.id}
            aria-pressed={locale === o.id}
            onClick={() => setLocale(o.id)}
            className={`focus-ring-light min-h-12 flex-1 rounded-full border text-base font-semibold ${
              locale === o.id ? "border-white bg-white text-deep" : "border-white/40 text-white hover:bg-white/10"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function WelcomePage() {
  const { t } = useT();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) router.replace("/home");
  }, [user, router]);

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-10">
      <section
        aria-labelledby="welcome-title"
        className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-primary via-[#0d4f48] to-deep px-6 pb-8 pt-6 text-white shadow-[var(--shadow-float)] lg:flex-1"
      >
        {/* Static decorative shape inspired by the reference; no animation. */}
        <svg aria-hidden className="pointer-events-none absolute -right-16 top-10 h-72 w-72 opacity-25" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="80" fill="none" stroke="#5fd3b5" strokeWidth="34" />
        </svg>
        <div className="relative flex items-center gap-2 text-xl font-bold">
          <span aria-hidden className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-primary">
            <Icon name="check" size={20} strokeWidth={2.6} />
          </span>
          {t("app.name")}
        </div>

        <p className="relative mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-white/80">{t("welcome.eyebrow")}</p>
        <h1 id="welcome-title" className="relative mt-3 text-[2.4rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          {t("welcome.titleA")} <span className="text-mint">{t("welcome.titleB")}</span>
          <br />
          {t("welcome.titleC")} <span className="text-mint">{t("welcome.titleD")}</span>
        </h1>
        <p className="relative mt-4 max-w-md text-[1.05rem] text-white/90">{t("welcome.intro")}</p>

        <ol className="relative mt-6 space-y-2">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-ink shadow-[var(--shadow-card)]">
              <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon name={s.icon} size={20} />
              </span>
              <span className="text-sm text-muted">{i + 1}.</span>
              <span className="font-medium">{t(s.key)}</span>
            </li>
          ))}
        </ol>

        <div className="relative mt-6">
          <LanguageChoice />
        </div>
      </section>

      <section aria-label={t("welcome.tryExample")} className="mt-5 space-y-3 pb-6 lg:mt-0 lg:w-96">
        <Link href="/demo" className={buttonClass("dark", "lg", true)}>
          {t("welcome.tryExample")}
          <Icon name="arrowRight" size={20} />
        </Link>
        <p className="text-center text-sm text-muted">{t("welcome.tryExampleHint")}</p>
        <Link href="/sign-in?next=/check/new" className={buttonClass("secondary", "lg", true)}>
          {t("welcome.start")}
        </Link>
        <Link href="/help" className={`${buttonClass("ghost", "md", true)}`}>
          {t("welcome.helpOnly")}
        </Link>
        <p className="pt-2 text-center text-sm text-muted">
          <a href="tel:112" className="inline-flex min-h-11 items-center font-semibold text-error underline underline-offset-2">
            {t("home.emergency")}
          </a>
        </p>
      </section>
    </main>
  );
}
