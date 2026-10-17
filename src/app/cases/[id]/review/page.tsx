"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useAnnounce, useT } from "@/app/providers";
import { Icon } from "@/components/Icon";
import { Button, Card, Notice } from "@/components/ui";
import { canRunCheck, checkTypeFor, isCheckStale, type CaseRecord } from "@/domain/case";
import { FIELD_DEFS, type FieldKey } from "@/domain/facts";
import { ErrorNotice, CaseFrame, type CaseCtx } from "@/features/cases/CaseFrame";
import { caseClient } from "@/features/cases/client";
import { EvidenceAside } from "@/features/evidence/EvidenceAside";
import { useEvidenceViewer } from "@/features/evidence/EvidenceViewer";
import { FactRow } from "@/features/review/FactRow";
import { GROUPS } from "@/features/review/fieldMeta";

function ReviewBody({ ctx }: { ctx: CaseCtx }) {
  const { c, mutate, busy, error, reload } = ctx;
  const { t } = useT();
  const announce = useAnnounce();
  const router = useRouter();
  const viewer = useEvidenceViewer(c);
  const summaryRef = useRef<HTMLDivElement>(null);
  const type = checkTypeFor(c.issueType);
  const gate = canRunCheck(c);
  const isLive = c.events.some((e) => e.type === "records_read" && e.meta?.live === 1);
  const isRecordedDemo = c.mode === "demo" && c.fixtureId !== "E" && !isLive;

  const shown = (k: FieldKey) => FIELD_DEFS[k].critical || c.facts[k] !== undefined;

  const run = async () => {
    if (!gate.ok) {
      summaryRef.current?.focus();
      return;
    }
    const next = await mutate("check", (cur) => caseClient.runCheck(cur));
    if (next) {
      announce(t(`result.outcome_${next.check?.outcome}`));
      router.push(`/cases/${next.id}/result`);
    }
  };

  const docName = (docId: string | null) => c.evidence.find((e) => e.id === docId)?.filename ?? null;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("review.title")}</h1>
      <p className="mt-1 text-muted">{t("review.intro")}</p>

      {isRecordedDemo ? (
        <Notice tone="demo" className="mt-4" title={t("evidence.recordedResult")}>
          {t("evidence.recordedResultNote")}
        </Notice>
      ) : null}
      {isLive ? (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary-strong">
          <Icon name="sparkle" size={16} />
          {t("evidence.liveResult")}
        </p>
      ) : null}

      {c.description ? (
        <Card className="mt-4">
          <p className="text-sm font-semibold text-muted">{t("review.yourAccount")}</p>
          <p className="mt-1">{c.description}</p>
        </Card>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorNotice error={error} onRetry={reload} />
        </div>
      ) : null}

      <div
        ref={summaryRef}
        tabIndex={-1}
        className="mt-4"
        role={gate.ok ? undefined : "region"}
        aria-label={gate.ok ? undefined : t("review.errorSummary")}
      >
        {gate.ok ? (
          <Notice tone="success">{t("review.allConfirmed")}</Notice>
        ) : (
          <Notice tone="attention" title={t("review.needConfirm", { count: gate.pending.length })}>
            <ul className="mt-1 list-disc pl-5">
              {gate.pending.map((k) => (
                <li key={k}>
                  <a href={`#f-${k}`} className="inline-flex min-h-11 items-center underline underline-offset-2">
                    {t(`field.${k}`)}
                  </a>
                </li>
              ))}
            </ul>
          </Notice>
        )}
      </div>

      {GROUPS[type].map((g) => {
        const visible = g.fields.filter(shown);
        const extra = g.fields.filter((k) => !shown(k));
        return (
          <Card key={g.titleKey} className="mt-4">
            <h2 className="text-lg font-semibold">{t(g.titleKey)}</h2>
            <ul>
              {visible.map((k) => (
                <FactRow
                  key={k}
                  fieldKey={k}
                  fact={c.facts[k]}
                  disabled={!!busy}
                  sourceName={docName(c.facts[k]?.sourceDocumentId ?? null)}
                  onViewSource={viewer.open}
                  onChange={(f) => mutate("fact", (cur) => caseClient.editFact(cur, k, f))}
                />
              ))}
            </ul>
            {extra.length ? (
              <details className="mt-2 border-t border-border pt-3">
                <summary className="min-h-11 cursor-pointer font-medium text-primary">
                  + {t("app.optional")}: {extra.map((k) => t(`field.${k}`)).join(", ")}
                </summary>
                <ul>
                  {extra.map((k) => (
                    <FactRow
                      key={k}
                      fieldKey={k}
                      fact={undefined}
                      disabled={!!busy}
                      onChange={(f) => mutate("fact", (cur) => caseClient.editFact(cur, k, f))}
                    />
                  ))}
                </ul>
              </details>
            ) : null}
          </Card>
        );
      })}

      {c.check && isCheckStale(c) ? (
        <Notice tone="attention" className="mt-4">
          {t("result.stale")}
        </Notice>
      ) : null}

      <div className="no-print sticky bottom-0 -mx-4 mt-6 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-4 pt-6 sm:-mx-6 sm:px-6">
        <Button size="lg" block onClick={run} busy={busy === "check"} aria-describedby={gate.ok ? undefined : "gate-hint"}>
          {busy === "check" ? t("review.checking") : t("review.runCheck")}
        </Button>
        {!gate.ok ? (
          <p id="gate-hint" className="mt-2 text-center text-sm text-muted">
            {t("review.needConfirm", { count: gate.pending.length })}
          </p>
        ) : null}
      </div>
      {viewer.dialog}
    </>
  );
}

export default function ReviewPage() {
  const { t } = useT();
  return (
    <CaseFrame title={t("review.title")} backHref={(id) => `/cases/${id}`} aside={({ c }) => <EvidenceAside c={c as CaseRecord} />}>
      {(ctx) => <ReviewBody ctx={ctx} />}
    </CaseFrame>
  );
}
