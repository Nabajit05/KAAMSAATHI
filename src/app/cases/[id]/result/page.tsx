"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/app/providers";
import { Icon, type IconName } from "@/components/Icon";
import { Badge, Button, Card, LinkButton, Notice } from "@/components/ui";
import { canRunCheck, isCheckStale } from "@/domain/case";
import { formatINR } from "@/domain/money";
import type { Outcome } from "@/domain/result";
import { CaseFrame, ErrorNotice, type CaseCtx } from "@/features/cases/CaseFrame";
import { caseClient } from "@/features/cases/client";
import { EvidenceAside } from "@/features/evidence/EvidenceAside";
import { useEvidenceViewer } from "@/features/evidence/EvidenceViewer";
import { reasonText } from "@/features/result/format";
import { GUIDANCE } from "@/content/guidance";

const OUTCOME_STYLE: Record<Outcome, { icon: IconName; box: string; iconBox: string }> = {
  records_match: { icon: "check", box: "bg-surface", iconBox: "bg-success-soft text-success-ink" },
  possible_difference: { icon: "alert", box: "bg-surface ring-2 ring-attention-line", iconBox: "bg-attention text-attention-ink" },
  more_info_needed: { icon: "info", box: "bg-surface ring-2 ring-control", iconBox: "bg-sunken text-ink" },
};

function ResultBody({ ctx }: { ctx: CaseCtx }) {
  const { c, mutate, busy, error, reload } = ctx;
  const { t, locale } = useT();
  const router = useRouter();

        const viewer = useEvidenceViewer(c);
        const chk = c.check;
        if (!chk) {
          return (
            <>
              <Notice tone="info">{t("review.needConfirm", { count: 1 })}</Notice>
              <LinkButton href={`/cases/${c.id}/review`} className="mt-4">
                {t("review.title")}
              </LinkButton>
            </>
          );
        }
        const stale = isCheckStale(c);
        const style = OUTCOME_STYLE[chk.outcome];
        const showAmounts = chk.outcome !== "more_info_needed" && chk.expectedPaise !== null && chk.observedPaise !== null;
        const docFor = (fields: string[]) => {
          for (const f of fields) {
            const id = c.facts[f as keyof typeof c.facts]?.sourceDocumentId;
            if (id) return id;
          }
          return null;
        };
        const keepProof = GUIDANCE.find((g) => g.id === "keep-proof-ask-platform")!;

        return (
          <>
            <h1 className="sr-only">{t("result.title")}</h1>
            {stale ? (
              <Notice tone="attention" className="mb-4" title={t("result.stale")}>
                <Button
                  size="sm"
                  className="mt-2"
                  busy={busy === "check"}
                  disabled={!canRunCheck(c).ok}
                  onClick={() => mutate("check", (cur) => caseClient.runCheck(cur))}
                >
                  {t("result.recheck")}
                </Button>
              </Notice>
            ) : null}
            {error ? <ErrorNotice error={error} onRetry={reload} /> : null}

            <section aria-labelledby="outcome" className={`rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)] ${style.box} ${stale ? "opacity-70" : ""}`}>
              <div className="flex items-start gap-3">
                <span aria-hidden className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${style.iconBox}`}>
                  <Icon name={style.icon} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-muted">{t("result.basedOn")}</p>
                  <h2 id="outcome" className="text-2xl font-semibold leading-tight">
                    {t(`result.outcome_${chk.outcome}`)}
                  </h2>
                </div>
              </div>
              <p className="mt-4 text-[1.05rem]">{reasonText(chk.primary, locale, t)}</p>

              {showAmounts ? (
                <dl className="tabular mt-5 grid grid-cols-1 gap-2 border-t border-border pt-4 min-[400px]:grid-cols-3">
                  <div className="flex items-baseline justify-between gap-3 min-[400px]:block">
                    <dt className="text-sm text-muted">{t("result.expected")}</dt>
                    <dd className="text-xl font-semibold min-[400px]:text-lg sm:text-xl">{formatINR(chk.expectedPaise!)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 min-[400px]:block">
                    <dt className="text-sm text-muted">{t("result.received")}</dt>
                    <dd className="text-xl font-semibold min-[400px]:text-lg sm:text-xl">{formatINR(chk.observedPaise!)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 min-[400px]:block">
                    <dt className="text-sm text-muted">{t("result.difference")}</dt>
                    <dd className={`text-xl font-semibold min-[400px]:text-lg sm:text-xl ${chk.differencePaise ? "text-attention-ink" : ""}`}>{formatINR(chk.differencePaise ?? 0)}</dd>
                  </div>
                </dl>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone={chk.strength === "records" ? "primary" : "neutral"}>{t(`result.strength_${chk.strength}`)}</Badge>
              </div>

              {chk.reasons.length > 1 ? (
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {chk.reasons.slice(1).map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <Icon name="info" size={18} className="mt-1 shrink-0 text-muted" />
                      <span>{reasonText(r, locale, t)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            {chk.outcome === "more_info_needed" && chk.missing.length ? (
              <Card className="mt-4">
                <h2 className="text-lg font-semibold">{t("result.missingTitle")}</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {chk.missing.map((k) => (
                    <li key={k}>{t(`field.${k}`)}</li>
                  ))}
                </ul>
                <p className="mt-2 text-muted">{t("review.whichDocHelps")}</p>
              </Card>
            ) : null}

            <Card className="mt-4">
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center justify-between text-lg font-semibold">
                  {t("result.howWeChecked")}
                  <Icon name="chevronDown" />
                </summary>
                <table className="tabular mt-3 w-full text-left">
                  <caption className="sr-only">{t("result.howWeChecked")}</caption>
                  <tbody>
                    {chk.steps.map((s, i) => {
                      const docId = docFor(s.fields);
                      const value =
                        s.amount !== null
                          ? formatINR(s.amount)
                          : s.count !== undefined && s.count !== null
                            ? t(s.label.includes("day") ? "calc.days" : "calc.orders", { count: s.count })
                            : "";
                      return (
                        <tr key={i} className={`border-t border-border ${s.op === "=" ? "font-semibold" : ""}`}>
                          <th scope="row" className="py-2 pr-2 font-normal">
                            <span aria-hidden className="inline-block w-5 text-muted">
                              {s.op === "info" ? "" : s.op}
                            </span>
                            {t(`calc.${s.label}`)}
                            {docId ? (
                              <button
                                type="button"
                                onClick={(e) => viewer.open(docId, e.currentTarget)}
                                className="ml-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2"
                              >
                                {t("result.viewEvidence")}
                              </button>
                            ) : null}
                          </th>
                          <td className="py-2 text-right">{value}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-sm text-muted">{t("result.rule", { version: chk.ruleVersion, revision: chk.inputRevision })}</p>
              </details>
            </Card>

            {chk.checkType === "settlement" && chk.extras.grossEarnings != null ? (
              <Card className="mt-4">
                <h2 className="text-lg font-semibold">{t("result.netTitle")}</h2>
                <dl className="tabular mt-2 space-y-1">
                  <div className="flex justify-between gap-3">
                    <dt>{t("result.gross")}</dt>
                    <dd className="font-semibold">{formatINR(chk.extras.grossEarnings)}</dd>
                  </div>
                  {chk.extras.netAfterRecordedExpenses != null ? (
                    <div className="flex justify-between gap-3">
                      <dt>{t("result.netAfterExpenses")}</dt>
                      <dd className="font-semibold">{formatINR(chk.extras.netAfterRecordedExpenses)}</dd>
                    </div>
                  ) : null}
                </dl>
                {chk.reasons.some((r) => r.code === "expenses_incomplete") ? <p className="mt-2 text-sm text-muted">{t("result.netIncomplete")}</p> : null}
              </Card>
            ) : null}

            <p className="mt-4 text-sm text-muted">{t("result.notLegal")}</p>

            <section aria-labelledby="next" className="mt-6 space-y-3">
              <h2 id="next" className="text-lg font-semibold">
                {t("result.nextSteps")}
              </h2>
              {chk.outcome === "more_info_needed" ? (
                <LinkButton href={`/cases/${c.id}/${c.mode === "demo" ? "review" : "evidence"}`} size="lg" block>
                  {t("review.addMissing")}
                </LinkButton>
              ) : (
                <Button
                  size="lg"
                  block
                  variant={chk.outcome === "possible_difference" ? "primary" : "secondary"}
                  disabled={stale}
                  onClick={() => router.push(`/cases/${c.id}/complaint`)}
                >
                  {chk.outcome === "possible_difference" ? t("result.prepareComplaint") : t("result.askClarification")}
                </Button>
              )}
              <Card>
                <p className="font-semibold">{keepProof.title[locale]}</p>
                <p className="mt-1 text-muted">{keepProof.nextStep[locale]}</p>
                <LinkButton href="/help" variant="ghost" size="sm" className="-ml-3 mt-1">
                  {t("nav.help")}
                </LinkButton>
              </Card>
            </section>
            {viewer.dialog}
          </>
        );
}

export default function ResultPage() {
  const { t } = useT();
  return (
    <CaseFrame title={t("result.title")} backHref={(id) => `/cases/${id}/review`} aside={({ c }) => <EvidenceAside c={c} />}>
      {(ctx) => <ResultBody ctx={ctx} />}
    </CaseFrame>
  );
}
