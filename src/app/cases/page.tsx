"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Badge, Card, LinkButton, Spinner } from "@/components/ui";
import { ErrorNotice } from "@/features/cases/CaseFrame";
import { useCaseList } from "@/features/cases/useCases";
import { formatDateTime } from "@/locales";
import { useAuth, useT } from "../providers";

export default function CasesPage() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const { cases, error, reload } = useCaseList();
  return (
    <AppShell>
      <div className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("caseDetail.listTitle")}</h1>
      </div>
      {error ? (
        <div className="mt-4">
          <ErrorNotice error={error} onRetry={reload} />
        </div>
      ) : null}
      {!cases ? (
        <div className="py-8">
          <Spinner label={t("app.loading")} />
        </div>
      ) : cases.length === 0 ? (
        <Card className="mt-4">
          <p>{t("caseDetail.empty")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <LinkButton href={user ? "/check/new" : "/sign-in?next=/check/new"}>{t("home.checkPayment")}</LinkButton>
            <LinkButton href="/demo" variant="secondary">
              {t("home.tryExample")}
            </LinkButton>
          </div>
        </Card>
      ) : (
        <ul className="mt-4 space-y-3">
          {cases.map((c) => (
            <Card as="li" key={c.id} className="p-0">
              <Link href={`/cases/${c.id}`} className="flex items-center gap-3 rounded-[var(--radius-card)] p-5 hover:bg-sunken">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t(`intake.issue_${c.issueType}`)}</p>
                  <p className="text-sm text-muted">
                    {c.platformLabel ?? t("intake.workDaily")} · {t("caseDetail.updated", { date: formatDateTime(c.updatedAt, locale) })}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.mode === "demo" ? <Badge tone="attention">{t("caseDetail.demoCase")}</Badge> : null}
                    {c.check ? (
                      <Badge tone={c.check.outcome === "possible_difference" ? "attention" : c.check.outcome === "records_match" ? "success" : "neutral"}>
                        {t(`result.outcome_${c.check.outcome}`)}
                      </Badge>
                    ) : null}
                    <Badge>{t(`caseDetail.status_${c.workflowStatus}`)}</Badge>
                  </div>
                </div>
                <Icon name="chevronRight" className="shrink-0 text-muted" />
              </Link>
            </Card>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
