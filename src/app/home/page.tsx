"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Badge, Card, LinkButton, RoundLink } from "@/components/ui";
import { CaseProgress } from "@/features/cases/CaseProgress";
import { nextStepFor } from "@/features/cases/nextStep";
import { useCaseList } from "@/features/cases/useCases";
import { useAuth, useT } from "../providers";

function greetingKey(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  if (h < 12) return "home.greetingMorning";
  if (h < 17) return "home.greetingAfternoon";
  return "home.greetingEvening";
}

export default function HomePage() {
  const { t } = useT();
  const { user } = useAuth();
  const { cases } = useCaseList();
  const recent = cases?.[0] ?? null;

  return (
    <AppShell>
      <div className="flex items-center gap-3 pt-2">
        <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="user" />
        </span>
        <div>
          <p className="text-muted">{t(greetingKey())}</p>
          <p className="font-semibold">{user?.phone ? `+${user.phone}` : user?.email ?? t("home.guest")}</p>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted">{t("home.eyebrow")}</p>
      <h1 className="mt-1 text-[2.1rem] font-semibold leading-[1.15] tracking-tight sm:text-[2.6rem]">
        <span>{t("home.headlineA")}</span> <span className="text-faint">{t("home.headlineB")}</span>{" "}
        <span>{t("home.headlineC")}</span> <span className="text-faint">{t("home.headlineD")}</span>{" "}
        <span>{t("home.headlineE")}</span>
      </h1>

      <div className="mt-6 space-y-4">
        <Card className="bg-deep text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{t("home.checkPayment")}</h2>
              <p className="mt-1 text-white/80">{t("home.checkPaymentHint")}</p>
            </div>
            <span aria-hidden className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-mint">
              <Icon name="sparkle" />
            </span>
          </div>
          <LinkButton href={user ? "/check/new" : "/sign-in?next=/check/new"} variant="light" size="lg" block className="mt-5 focus-ring-light">
            {t("home.checkPayment")}
            <Icon name="arrowRight" size={20} />
          </LinkButton>
          {!user ? (
            <Link href="/demo" className="focus-ring-light mt-2 flex min-h-11 items-center justify-center text-center text-sm font-semibold text-mint underline underline-offset-4">
              {t("home.tryExample")}
            </Link>
          ) : null}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("home.addEarnings")}</h2>
              <p className="text-muted">{t("home.addEarningsHint")}</p>
            </div>
            <RoundLink href="/earnings" label={t("home.addEarnings")} />
          </div>
        </Card>

        {recent ? (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted">{t("home.recentCase")}</p>
                <h2 className="mt-0.5 text-lg font-semibold">{t(`intake.issue_${recent.issueType}`)}</h2>
                <p className="text-muted">
                  {recent.platformLabel ?? t("intake.workDaily")}
                  {recent.mode === "demo" ? (
                    <>
                      {" "}
                      · <Badge tone="attention">{t("caseDetail.demoCase")}</Badge>
                    </>
                  ) : null}
                </p>
              </div>
              <RoundLink href={`/cases/${recent.id}`} label={t("caseDetail.continue")} />
            </div>
            <div className="mt-4">
              <CaseProgress c={recent} />
            </div>
            <LinkButton href={nextStepFor(recent).href} variant="dark" className="mt-4">
              {t("home.nextAction")}: {t(nextStepFor(recent).labelKey)}
            </LinkButton>
          </Card>
        ) : cases ? (
          <Card>
            <p className="text-muted">{t("home.noCases")}</p>
          </Card>
        ) : null}

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("home.needHelp")}</h2>
              <p className="text-muted">{t("home.needHelpHint")}</p>
            </div>
            <RoundLink href="/help" label={t("home.needHelp")} />
          </div>
          <a href="tel:112" className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-error underline underline-offset-2">
            <Icon name="phone" size={18} />
            {t("home.emergency")}
          </a>
        </Card>
      </div>
    </AppShell>
  );
}
