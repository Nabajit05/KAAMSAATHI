"use client";

import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui";
import { guidanceBySection, type GuidanceSection } from "@/content/guidance";
import { formatDateLabel } from "@/locales";
import { useT } from "../providers";

const SECTIONS: GuidanceSection[] = ["payment", "safety", "welfare"];

export default function HelpPage() {
  const { t, locale } = useT();
  return (
    <AppShell>
      <h1 className="pt-2 text-3xl font-semibold tracking-tight">{t("help.title")}</h1>
      <p className="mt-2 text-muted">{t("help.intro")}</p>

      {/* Emergency access never depends on AI or network calls. */}
      <section aria-labelledby="emergency" className="mt-5 rounded-[var(--radius-card)] border-2 border-error bg-surface p-5">
        <h2 id="emergency" className="flex items-center gap-2 text-lg font-semibold text-error">
          <Icon name="alert" />
          {t("help.emergencyTitle")}
        </h2>
        <p className="mt-1">{t("help.emergencyBody")}</p>
        <a
          href="tel:112"
          className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-error px-6 font-semibold text-white hover:opacity-90"
        >
          <Icon name="phone" size={20} />
          {t("help.call112")}
        </a>
      </section>

      {SECTIONS.map((section) => (
        <section key={section} aria-labelledby={`sec-${section}`} className="mt-8">
          <h2 id={`sec-${section}`} className="text-xl font-semibold">
            {t(`help.section_${section}`)}
          </h2>
          <ul className="mt-3 space-y-3">
            {guidanceBySection(section).map((g) => (
              <Card as="li" key={g.id}>
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    <span>{g.title[locale]}</span>
                    <Icon name="chevronDown" className="shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 space-y-3">
                    <p>{g.summary[locale]}</p>
                    <div className="rounded-2xl bg-primary-soft p-3">
                      <p className="text-sm font-semibold text-primary-strong">{t("help.nextStep")}</p>
                      <p>{g.nextStep[locale]}</p>
                    </div>
                    {g.needsHumanVerification ? (
                      <p className="flex gap-2 text-sm text-attention-ink">
                        <Icon name="info" size={18} className="mt-0.5 shrink-0" />
                        {t("help.needsVerification")}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted">
                      {t("help.source")}:{" "}
                      {g.source.url ? (
                        <a href={g.source.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2" lang="en">
                          {g.source.title}
                        </a>
                      ) : (
                        <span lang="en">{g.source.title}</span>
                      )}{" "}
                      <span lang="en">({g.source.publisher})</span>
                      <br />
                      {t("help.reviewed", { date: formatDateLabel(g.reviewedOn, locale) })}
                    </p>
                  </div>
                </details>
              </Card>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-8 text-sm text-muted">{t("help.notLegalAdvice")}</p>
    </AppShell>
  );
}
