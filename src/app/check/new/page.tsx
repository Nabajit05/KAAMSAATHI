"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Button, LinkButton, Notice } from "@/components/ui";
import type { IssueType, WorkType } from "@/domain/case";
import { ErrorNotice } from "@/features/cases/CaseFrame";
import { caseClient } from "@/features/cases/client";
import { VoiceRecorder } from "@/features/speech/VoiceRecorder";
import { formatDateLabel } from "@/locales";
import { ApiError } from "@/shared/errors";
import { useAnnounce, useAuth, useT } from "../../providers";

type Step = "work" | "issue" | "platform" | "period" | "description" | "confirm";

interface Answers {
  workType: WorkType | null;
  issueType: IssueType | null;
  platformLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  description: string;
  descriptionSource: "typed" | "voice" | null;
}

const PLATFORM_ISSUES: IssueType[] = ["missing_incentive", "deduction", "payout_mismatch", "not_sure"];

function stepsFor(a: Answers): Step[] {
  return a.workType === "daily_wage" ? ["work", "period", "description", "confirm"] : ["work", "issue", "platform", "period", "description", "confirm"];
}

function Bubble({ from, children }: { from: "app" | "worker"; children: ReactNode }) {
  return from === "app" ? (
    <div className="max-w-[88%] rounded-3xl rounded-tl-lg bg-surface px-4 py-3 shadow-[var(--shadow-card)]">{children}</div>
  ) : (
    <div className="ml-auto max-w-[88%] rounded-3xl rounded-tr-lg border border-border bg-primary-soft px-4 py-3">{children}</div>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-12 rounded-full border px-4 text-left font-medium ${selected ? "border-primary bg-primary text-white" : "border-control bg-surface hover:bg-sunken"}`}
    >
      {children}
    </button>
  );
}

export default function IntakePage() {
  const { t, locale } = useT();
  const { user, configured, loading } = useAuth();
  const announce = useAnnounce();
  const router = useRouter();
  const id = useId();
  const [a, setA] = useState<Answers>({ workType: null, issueType: null, platformLabel: null, periodStart: null, periodEnd: null, description: "", descriptionSource: null });
  const [step, setStep] = useState<Step>("work");
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const steps = stepsFor(a);
  const index = steps.indexOf(step);

  // Move focus to each new question so keyboard and screen-reader users follow along.
  useEffect(() => {
    questionRef.current?.focus();
  }, [step]);

  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };
  const next = () => go(steps[Math.min(index + 1, steps.length - 1)]);
  const back = () => (index > 0 ? go(steps[index - 1]) : router.push("/home"));

  const answered = (s: Step): ReactNode => {
    switch (s) {
      case "work":
        return a.workType === "daily_wage" ? t("intake.workDaily") : t("intake.workPlatform");
      case "issue":
        return a.issueType ? t(`intake.issue_${a.issueType}`) : null;
      case "platform":
        return a.platformLabel ?? t("app.dontKnow");
      case "period":
        return a.periodStart ? `${formatDateLabel(a.periodStart, locale)}${a.periodEnd && a.periodEnd !== a.periodStart ? ` – ${formatDateLabel(a.periodEnd, locale)}` : ""}` : t("app.dontKnow");
      case "description":
        return a.description || "—";
      default:
        return null;
    }
  };

  const questionKey: Record<Step, string> = {
    work: "intake.workTypeQ",
    issue: "intake.issueQ",
    platform: "intake.platformQ",
    period: "intake.periodQ",
    description: "intake.descriptionQ",
    confirm: "intake.confirmQ",
  };

  const create = async () => {
    setBusy(true);
    setApiError(null);
    try {
      const c = await caseClient.create({
        workType: a.workType!,
        issueType: a.issueType!,
        platformLabel: a.platformLabel,
        periodStart: a.periodStart,
        periodEnd: a.periodEnd ?? a.periodStart,
        description: a.description.trim(),
        descriptionSource: a.descriptionSource,
      });
      announce(t("intake.created"));
      router.push(`/cases/${c.id}/evidence`);
    } catch (e) {
      setApiError(e instanceof ApiError ? e : new ApiError("internal", "failed", 0, true));
      setBusy(false);
    }
  };

  if (!configured || (!loading && !user)) {
    return (
      <AppShell variant="task" title={t("intake.title")} backHref="/home">
        <Notice tone="info" title={configured ? t("intake.signInNeeded") : t("auth.unavailable")} />
        <div className="mt-4 flex flex-wrap gap-2">
          {configured ? <LinkButton href="/sign-in?next=/check/new">{t("intake.signIn")}</LinkButton> : null}
          <LinkButton href="/demo" variant="secondary">
            {t("welcome.tryExample")}
          </LinkButton>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell variant="task" title={t("intake.title")} backHref="/home">
      <p className="text-sm text-muted">{t("intake.stepOf", { n: index + 1, total: steps.length })}</p>

      {/* Conversation so far: previous answers, each changeable. */}
      <ol className="mt-3 space-y-3">
        {steps.slice(0, index).map((s) => (
          <li key={s} className="space-y-2">
            <Bubble from="app">
              <p className="text-muted">{t(questionKey[s])}</p>
            </Bubble>
            <Bubble from="worker">
              <p className="break-words">{answered(s)}</p>
              <button type="button" onClick={() => go(s)} className="mt-1 text-sm font-medium text-primary underline underline-offset-2">
                {t("app.edit")}
                <span className="sr-only">: {t(questionKey[s])}</span>
              </button>
            </Bubble>
          </li>
        ))}
      </ol>

      <section aria-labelledby={`${id}-q`} className="mt-4 space-y-4">
        <Bubble from="app">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Icon name="sparkle" size={16} />
            {t("intake.assistantName")}
          </p>
          <h1 id={`${id}-q`} ref={questionRef} tabIndex={-1} className="mt-1 text-xl font-semibold">
            {t(questionKey[step])}
          </h1>
        </Bubble>

        {error ? (
          <p id={`${id}-err`} role="alert" className="font-medium text-error">
            {error}
          </p>
        ) : null}

        {step === "work" ? (
          <div className="grid gap-2">
            {(["platform", "daily_wage"] as WorkType[]).map((w) => (
              <Chip
                key={w}
                selected={a.workType === w}
                onClick={() => {
                  setA((x) => ({ ...x, workType: w, issueType: w === "daily_wage" ? "wage_due" : x.issueType === "wage_due" ? null : x.issueType }));
                  go(w === "daily_wage" ? "period" : "issue");
                }}
              >
                {w === "platform" ? t("intake.workPlatform") : t("intake.workDaily")}
              </Chip>
            ))}
          </div>
        ) : null}

        {step === "issue" ? (
          <div className="grid gap-2">
            {PLATFORM_ISSUES.map((i) => (
              <Chip
                key={i}
                selected={a.issueType === i}
                onClick={() => {
                  setA((x) => ({ ...x, issueType: i }));
                  go("platform");
                }}
              >
                {t(`intake.issue_${i}`)}
              </Chip>
            ))}
          </div>
        ) : null}

        {step === "platform" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
            className="space-y-3"
          >
            <label htmlFor={`${id}-p`} className="sr-only">
              {t("intake.platformQ")}
            </label>
            <p id={`${id}-p-hint`} className="text-sm text-muted">
              {t("intake.platformHint")}
            </p>
            <input
              id={`${id}-p`}
              value={a.platformLabel ?? ""}
              maxLength={60}
              placeholder={t("intake.platformPlaceholder")}
              aria-describedby={`${id}-p-hint`}
              onChange={(e) => setA((x) => ({ ...x, platformLabel: e.target.value || null }))}
              className="min-h-12 w-full rounded-xl border-2 border-control bg-surface px-3"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{t("intake.next")}</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setA((x) => ({ ...x, platformLabel: null }));
                  next();
                }}
              >
                {t("app.dontKnow")}
              </Button>
            </div>
          </form>
        ) : null}

        {step === "period" ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (a.periodStart && a.periodEnd && a.periodEnd < a.periodStart) {
                setError(`${t("intake.periodEnd")}: ${t("review.invalidDate")}`);
                return;
              }
              next();
            }}
            className="space-y-3"
          >
            <p id={`${id}-d-hint`} className="text-sm text-muted">
              {t("intake.periodHint")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${id}-ds`} className="block font-medium">
                  {t("intake.periodStart")}
                </label>
                <input id={`${id}-ds`} type="date" value={a.periodStart ?? ""} aria-describedby={`${id}-d-hint`} onChange={(e) => setA((x) => ({ ...x, periodStart: e.target.value || null }))} className="mt-1 min-h-12 w-full rounded-xl border-2 border-control bg-surface px-2" />
              </div>
              <div>
                <label htmlFor={`${id}-de`} className="block font-medium">
                  {t("intake.periodEnd")}
                </label>
                <input
                  id={`${id}-de`}
                  type="date"
                  value={a.periodEnd ?? ""}
                  min={a.periodStart ?? undefined}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={`${id}-d-hint${error ? ` ${id}-err` : ""}`}
                  onChange={(e) => setA((x) => ({ ...x, periodEnd: e.target.value || null }))}
                  className="mt-1 min-h-12 w-full rounded-xl border-2 border-control bg-surface px-2"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">{t("intake.next")}</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setA((x) => ({ ...x, periodStart: null, periodEnd: null }));
                  next();
                }}
              >
                {t("app.dontKnow")}
              </Button>
            </div>
          </form>
        ) : null}

        {step === "description" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
            className="space-y-3"
          >
            <label htmlFor={`${id}-t`} className="sr-only">
              {t("intake.descriptionQ")}
            </label>
            <p id={`${id}-t-hint`} className="text-sm text-muted">
              {t("intake.descriptionHint")}
            </p>
            <div className="rounded-3xl bg-surface p-2 shadow-[var(--shadow-card)]">
              <textarea
                id={`${id}-t`}
                rows={4}
                maxLength={1000}
                value={a.description}
                placeholder={t("intake.descriptionPlaceholder")}
                aria-describedby={`${id}-t-hint`}
                onChange={(e) => setA((x) => ({ ...x, description: e.target.value }))}
                className="w-full resize-y rounded-2xl p-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                <VoiceRecorder
                  onTranscript={(text) => setA((x) => ({ ...x, description: x.description ? `${x.description} ${text}` : text, descriptionSource: "voice" }))}
                />
                <Button type="submit" variant="dark">
                  {t("intake.send")}
                </Button>
              </div>
            </div>
          </form>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-3">
            <dl className="space-y-2 rounded-3xl bg-surface p-4 shadow-[var(--shadow-card)]">
              {steps
                .filter((s) => s !== "confirm")
                .map((s) => (
                  <div key={s}>
                    <dt className="text-sm text-muted">{t(questionKey[s])}</dt>
                    <dd className="break-words font-medium">{answered(s)}</dd>
                  </div>
                ))}
            </dl>
            <p className="text-sm text-muted">{t("intake.confirmHint")}</p>
            {apiError ? <ErrorNotice error={apiError} onRetry={create} /> : null}
            <Button size="lg" block busy={busy} onClick={create}>
              {t("app.yes")}, {t("app.continue").toLowerCase()}
            </Button>
          </div>
        ) : null}
      </section>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" icon="back" onClick={back}>
          {t("app.back")}
        </Button>
        <Link href="/home" className="font-medium text-muted underline underline-offset-2">
          {t("app.cancel")}
        </Link>
      </div>
    </AppShell>
  );
}
