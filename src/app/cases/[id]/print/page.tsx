"use client";

import { useT } from "@/app/providers";
import { Button, LinkButton, Notice } from "@/components/ui";
import { isComplaintApproved } from "@/domain/case";
import { formatINR } from "@/domain/money";
import { CaseFrame, type CaseCtx } from "@/features/cases/CaseFrame";
import { caseClient } from "@/features/cases/client";
import { reasonText } from "@/features/result/format";
import { formatDateLabel, formatDateTime } from "@/locales";

/** Printable case summary. Uses the browser's own print / save-as-PDF, so Hindi renders with the page fonts. */
function PrintBody({ ctx }: { ctx: CaseCtx }) {
  const { c, mutate } = ctx;
  const { t, locale } = useT();
  const chk = c.check;
  const d = c.complaint;

  if (!d || !chk || !isComplaintApproved(d)) {
    return (
      <>
        <Notice tone="attention">{t("complaint.approveFirst")}</Notice>
        <LinkButton href={`/cases/${c.id}/complaint`} className="mt-4">
          {t("complaint.title")}
        </LinkButton>
      </>
    );
  }

  const print = async () => {
    await mutate("export", (cur) => caseClient.markExported(cur, "print"));
    window.print();
  };

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Button icon="print" onClick={print}>
          {t("complaint.print")}
        </Button>
        <LinkButton href={`/cases/${c.id}/complaint`} variant="secondary">
          {t("app.back")}
        </LinkButton>
      </div>
      <article className="print-sheet rounded-[var(--radius-card)] bg-surface p-6 shadow-[var(--shadow-card)]">
        <header className="border-b border-border pb-3">
          <p className="text-sm font-semibold text-primary">HaqCheck</p>
          {c.mode === "demo" ? <p className="font-bold text-attention-ink">{t("app.demoBannerLong")}</p> : null}
          <h1 className="mt-1 text-xl font-semibold">{t(`intake.issue_${c.issueType}`)}</h1>
          <p className="text-sm text-muted">
            {c.platformLabel ?? t("intake.workDaily")} · {formatDateLabel(c.periodStart, locale)}
            {c.periodEnd && c.periodEnd !== c.periodStart ? ` – ${formatDateLabel(c.periodEnd, locale)}` : ""}
          </p>
        </header>

        <section className="mt-4">
          <h2 className="font-semibold">{t(`result.outcome_${chk.outcome}`)}</h2>
          <p className="text-sm text-muted">{t("result.basedOn")}</p>
          <p className="mt-1">{reasonText(chk.primary, locale, t)}</p>
          <table className="tabular mt-3 w-full text-left text-sm">
            <caption className="sr-only">{t("result.howWeChecked")}</caption>
            <tbody>
              {chk.steps.map((s, i) => (
                <tr key={i} className="border-t border-border">
                  <th scope="row" className="py-1 font-normal">
                    {s.op === "info" ? "" : `${s.op} `}
                    {t(`calc.${s.label}`)}
                  </th>
                  <td className="py-1 text-right">{s.amount !== null ? formatINR(s.amount) : s.count ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">{t("result.rule", { version: chk.ruleVersion, revision: chk.inputRevision })}</p>
        </section>

        <section className="mt-5">
          <h2 className="font-semibold">{t("complaint.title")}</h2>
          <p className="mt-2 whitespace-pre-wrap" lang={d.locale}>
            {d.text}
          </p>
          <p className="mt-2 text-xs text-muted">
            {t("complaint.approved")}: {d.approvedAt ? formatDateTime(d.approvedAt, locale) : ""}
          </p>
        </section>

        <section className="mt-5">
          <h2 className="font-semibold">{t("complaint.evidenceSummary")}</h2>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {c.evidence.map((e) => (
              <li key={e.id}>
                {e.filename}
                {e.sha256 ? <span className="text-muted"> · SHA-256 {e.sha256.slice(0, 12)}…</span> : null}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-6 border-t border-border pt-3 text-xs text-muted">
          <p>{t("result.notLegal")}</p>
          <p className="mt-1">{t("complaint.exportIsNotSubmit")}</p>
        </footer>
      </article>
    </>
  );
}

export default function PrintPage() {
  const { t } = useT();
  return (
    <CaseFrame title={t("complaint.print")} backHref={(id) => `/cases/${id}/complaint`}>
      {(ctx) => <PrintBody ctx={ctx} />}
    </CaseFrame>
  );
}
