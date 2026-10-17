"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useAnnounce, useT } from "@/app/providers";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, LinkButton, Notice } from "@/components/ui";
import { isCheckStale, type WorkerOutcome } from "@/domain/case";
import { parseMoney } from "@/domain/money";
import { CaseFrame, ErrorNotice, type CaseCtx } from "@/features/cases/CaseFrame";
import { CaseProgress } from "@/features/cases/CaseProgress";
import { caseClient } from "@/features/cases/client";
import { nextStepFor } from "@/features/cases/nextStep";
import { formatDateLabel, formatDateTime } from "@/locales";

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function SubmissionForm({ ctx, onDone }: { ctx: CaseCtx; onDone: () => void }) {
  const { t } = useT();
  const id = useId();
  const [date, setDate] = useState(today());
  const [channel, setChannel] = useState("");
  const [ticket, setTicket] = useState("");
  const [err, setErr] = useState(false);
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!channel.trim()) {
          setErr(true);
          document.getElementById(`${id}-ch`)?.focus();
          return;
        }
        await ctx.mutate("submit", (cur) => caseClient.reportSubmission(cur, { submittedOn: date, channel: channel.trim(), ticketId: ticket.trim() || null }));
        onDone();
      }}
    >
      <div>
        <label htmlFor={`${id}-d`} className="block font-medium">
          {t("caseDetail.submittedOn")}
        </label>
        <input id={`${id}-d`} type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border-2 border-control px-3" required />
      </div>
      <div>
        <label htmlFor={`${id}-ch`} className="block font-medium">
          {t("caseDetail.channel")}
        </label>
        {err ? (
          <p id={`${id}-ch-err`} className="text-error">
            {t("caseDetail.channel")} — {t("app.required")}
          </p>
        ) : null}
        <input
          id={`${id}-ch`}
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          aria-invalid={err || undefined}
          aria-describedby={err ? `${id}-ch-err` : undefined}
          className={`mt-1 min-h-12 w-full rounded-xl border-2 px-3 ${err ? "border-error" : "border-control"}`}
          maxLength={80}
        />
      </div>
      <div>
        <label htmlFor={`${id}-tk`} className="block font-medium">
          {t("caseDetail.ticket")} <span className="font-normal text-muted">({t("app.optional")})</span>
        </label>
        <input id={`${id}-tk`} value={ticket} onChange={(e) => setTicket(e.target.value)} className="mt-1 min-h-12 w-full rounded-xl border-2 border-control px-3" maxLength={60} autoComplete="off" />
      </div>
      <Button type="submit" busy={ctx.busy === "submit"}>
        {t("app.save")}
      </Button>
    </form>
  );
}

function OutcomeForm({ ctx, onDone }: { ctx: CaseCtx; onDone: () => void }) {
  const { t } = useT();
  const id = useId();
  const [kind, setKind] = useState<WorkerOutcome["kind"]>("no_response");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState(false);
  const needsAmount = kind === "received_full" || kind === "received_part";
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        let amountPaise: number | null = null;
        if (needsAmount && amount.trim()) {
          const r = parseMoney(amount);
          if (!r.ok) {
            setErr(true);
            return;
          }
          amountPaise = r.paise;
        }
        await ctx.mutate("outcome", (cur) => caseClient.reportOutcome(cur, { kind, amountPaise }));
        onDone();
      }}
    >
      <fieldset>
        <legend className="font-medium">{t("caseDetail.recordResponse")}</legend>
        {(["received_full", "received_part", "declined", "no_response"] as const).map((k) => (
          <label key={k} className="flex min-h-11 items-center gap-3">
            <input type="radio" name={`${id}-k`} value={k} checked={kind === k} onChange={() => setKind(k)} className="h-5 w-5 accent-[var(--color-primary)]" />
            {t(`caseDetail.outcome_${k}`)}
          </label>
        ))}
      </fieldset>
      {needsAmount ? (
        <div>
          <label htmlFor={`${id}-a`} className="block font-medium">
            {t("caseDetail.amountReceived")} <span className="font-normal text-muted">({t("app.optional")})</span>
          </label>
          {err ? (
            <p id={`${id}-a-err`} className="text-error">
              {t("review.invalidMoney")}
            </p>
          ) : null}
          <input
            id={`${id}-a`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={err || undefined}
            aria-describedby={err ? `${id}-a-err` : undefined}
            className="tabular mt-1 min-h-12 w-full rounded-xl border-2 border-control px-3"
          />
        </div>
      ) : null}
      <Button type="submit" busy={ctx.busy === "outcome"}>
        {t("app.save")}
      </Button>
    </form>
  );
}

function DetailBody({ ctx }: { ctx: CaseCtx }) {
  const { c, error, reload } = ctx;
  const { t, locale } = useT();
  const announce = useAnnounce();
  const router = useRouter();
  const [form, setForm] = useState<"submit" | "outcome" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "deleting" | "pending">("idle");
  const deleteBtn = useRef<HTMLButtonElement>(null);
  const followId = useId();
  const next = nextStepFor(c);

  const doDelete = async () => {
    setDeleteState("deleting");
    try {
      const r = await caseClient.remove(c);
      if (r.status === "deleted") {
        announce(t("caseDetail.deleted"));
        router.push("/cases");
      } else setDeleteState("pending");
    } catch {
      setDeleteState("pending");
    }
  };

  return (
    <>
      <p className="text-sm text-muted">{c.platformLabel ?? t("intake.workDaily")}</p>
      <h1 className="text-2xl font-semibold">{t(`intake.issue_${c.issueType}`)}</h1>
      <p className="text-muted">
        {formatDateLabel(c.periodStart, locale)}
        {c.periodEnd && c.periodEnd !== c.periodStart ? ` – ${formatDateLabel(c.periodEnd, locale)}` : ""}
      </p>
      {error ? (
        <div className="mt-3">
          <ErrorNotice error={error} onRetry={reload} />
        </div>
      ) : null}

      <Card className="mt-4">
        <CaseProgress c={c} />
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-sm text-muted">{t("caseDetail.calcOutcome")}</dt>
            <dd className="font-semibold">
              {c.check ? t(`result.outcome_${c.check.outcome}`) : "—"}
              {c.check && isCheckStale(c) ? <Badge tone="attention">{t("result.recheck")}</Badge> : null}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted">{t("caseDetail.workflow")}</dt>
            <dd className="font-semibold">{t(`caseDetail.status_${c.workflowStatus}`)}</dd>
          </div>
        </dl>
        <LinkButton href={next.href} variant="dark" block className="mt-4">
          {t(next.labelKey)}
        </LinkButton>
      </Card>

      {c.complaint?.exportedAt || c.workflowStatus === "submitted" || c.workflowStatus === "resolved" ? (
        <Card className="mt-4">
          <h2 className="text-lg font-semibold">{t("caseDetail.workerReported")}</h2>
          {c.submission ? (
            <p className="mt-1">
              {t("caseDetail.event_submitted")}: {formatDateLabel(c.submission.submittedOn, locale)} · {c.submission.channel}
              {c.submission.ticketId ? ` · ${c.submission.ticketId}` : ""}
            </p>
          ) : null}
          {c.outcome ? <p className="mt-1">{t(`caseDetail.outcome_${c.outcome.kind}`)}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {!c.submission ? (
              <Button variant="secondary" aria-expanded={form === "submit"} onClick={() => setForm(form === "submit" ? null : "submit")}>
                {t("caseDetail.iSubmitted")}
              </Button>
            ) : (
              <Button variant="secondary" aria-expanded={form === "outcome"} onClick={() => setForm(form === "outcome" ? null : "outcome")}>
                {t("caseDetail.recordResponse")}
              </Button>
            )}
          </div>
          {form === "submit" ? <SubmissionForm ctx={ctx} onDone={() => setForm(null)} /> : null}
          {form === "outcome" ? <OutcomeForm ctx={ctx} onDone={() => setForm(null)} /> : null}
        </Card>
      ) : null}

      <Card className="mt-4">
        <label htmlFor={followId} className="block font-semibold">
          {t("caseDetail.followUp")}
        </label>
        <p id={`${followId}-n`} className="text-sm text-muted">
          {t("caseDetail.followUpNote")}
        </p>
        <input
          id={followId}
          type="date"
          min={today()}
          defaultValue={c.followUpDate ?? ""}
          aria-describedby={`${followId}-n`}
          onBlur={(e) => {
            const v = e.target.value || null;
            if (v !== c.followUpDate) ctx.mutate("follow", (cur) => caseClient.setFollowUp(cur, v));
          }}
          className="mt-2 min-h-12 w-full rounded-xl border-2 border-control px-3"
        />
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">{t("caseDetail.timeline")}</h2>
        <ol className="mt-3 space-y-3 border-l-2 border-border pl-4">
          {[...c.events].reverse().map((e) => (
            <li key={e.id} className="relative">
              <span aria-hidden className={`absolute -left-[23px] top-1.5 h-3 w-3 rounded-full ${e.actor === "worker" ? "bg-primary" : "bg-control"}`} />
              <p className="font-medium">
                {t(`caseDetail.event_${e.type}`)}
                {e.type === "checked" && typeof e.meta?.outcome === "string" ? `: ${t(`result.outcome_${e.meta.outcome}`)}` : ""}
                {e.type === "fact_changed" && typeof e.meta?.field === "string" ? `: ${t(`field.${e.meta.field}`)}` : ""}
              </p>
              <p className="text-sm text-muted">
                {formatDateTime(e.at, locale)}
                {e.type === "submitted" || e.type === "outcome_reported" ? ` · ${t("caseDetail.workerReported")}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-6 space-y-3">
        <LinkButton href={`/cases/${c.id}/evidence`} variant="secondary" block icon="plus">
          {t("caseDetail.addRecord")}
        </LinkButton>
        {deleteState === "pending" ? <Notice tone="attention">{t("caseDetail.deleteFailed")}</Notice> : null}
        {!confirmDelete ? (
          <Button ref={deleteBtn} variant="danger" block icon="trash" onClick={() => setConfirmDelete(true)}>
            {t("caseDetail.delete")}
          </Button>
        ) : (
          <div role="alertdialog" aria-labelledby="del-q" className="rounded-2xl border-2 border-error bg-surface p-4">
            <p id="del-q" className="font-semibold">
              {t("caseDetail.deleteConfirm")}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" autoFocus busy={deleteState === "deleting"} onClick={doDelete}>
                <Icon name="trash" size={18} />
                {t("caseDetail.delete")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmDelete(false);
                  requestAnimationFrame(() => deleteBtn.current?.focus());
                }}
              >
                {t("app.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function CaseDetailPage() {
  const { t } = useT();
  return (
    <CaseFrame title={t("caseDetail.title")} backHref={() => "/cases"}>
      {(ctx) => <DetailBody ctx={ctx} />}
    </CaseFrame>
  );
}
