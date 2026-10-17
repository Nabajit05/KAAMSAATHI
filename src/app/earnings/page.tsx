"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { AppShell, useOnline } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { summarizeDaily, summarizePlatform, type Total } from "@/domain/earnings";
import { formatINR, parseMoney } from "@/domain/money";
import { api } from "@/features/cases/client";
import {
  deviceConsent,
  enqueue,
  fetchEntries,
  flushQueue,
  pushEntry,
  readDeviceEntries,
  readQueue,
  removeDeviceEntry,
  saveDeviceEntry,
  setDeviceConsent,
  type LocalEntry,
  type SyncState,
} from "@/features/earnings/store";
import { formatDateLabel } from "@/locales";
import type { EarningsEntryInput } from "@/shared/contracts";
import { ApiError } from "@/shared/errors";
import { useAnnounce, useAuth, usePrefs, useT } from "../providers";

type Mode = "platform" | "daily_wage";

const PLATFORM_FIELDS = [
  ["grossPaise", "earnings.gross", false],
  ["adjustmentPaise", "earnings.adjustments", true],
  ["cashRetainedPaise", "earnings.cashKept", false],
  ["advanceOffsetPaise", "earnings.advance", false],
  ["payoutPaise", "earnings.payout", false],
  ["fuelPaise", "earnings.fuel", false],
  ["otherExpensePaise", "earnings.other", false],
] as const;

const DAILY_MONEY = [
  ["ratePaise", "earnings.rate"],
  ["paidPaise", "earnings.paid"],
  ["advancesPaise", "earnings.advances"],
] as const;

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function TotalValue({ total }: { total: Total | null }) {
  const { t } = useT();
  if (!total) return <span className="text-muted">{t("app.unknown")}</span>;
  return (
    <span>
      {formatINR(total.value)}
      {!total.complete ? <span className="ml-1 text-sm font-normal text-attention-ink">*</span> : null}
    </span>
  );
}

function EntryForm({ mode, onSave }: { mode: Mode; onSave: (e: EarningsEntryInput) => Promise<void> }) {
  const { t } = useT();
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({ periodStart: today(), periodEnd: today() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    const errs: Record<string, string> = {};
    const money = (k: string, signed = false): number | null => {
      const raw = values[k]?.trim();
      if (!raw) return null; // blank = unknown, not zero
      const r = parseMoney(raw, { allowNegative: signed });
      if (!r.ok) {
        errs[k] = t("review.invalidMoney");
        return null;
      }
      return r.paise;
    };
    const count = (k: string): number | null => {
      const raw = values[k]?.trim();
      if (!raw) return null;
      if (!/^\d{1,3}$/.test(raw)) {
        errs[k] = t("review.invalidCount");
        return null;
      }
      return Number(raw);
    };
    if (!values.periodStart) errs.periodStart = t("review.invalidDate");
    if (!values.periodEnd || values.periodEnd < values.periodStart) errs.periodEnd = t("review.invalidDate");
    const base = { clientId: crypto.randomUUID(), periodStart: values.periodStart, periodEnd: values.periodEnd, platformLabel: values.platformLabel?.trim() || null };
    const entry: EarningsEntryInput =
      mode === "platform"
        ? {
            ...base,
            workType: "platform",
            grossPaise: money("grossPaise"),
            adjustmentPaise: money("adjustmentPaise", true),
            cashRetainedPaise: money("cashRetainedPaise"),
            advanceOffsetPaise: money("advanceOffsetPaise"),
            payoutPaise: money("payoutPaise"),
            fuelPaise: money("fuelPaise"),
            otherExpensePaise: money("otherExpensePaise"),
          }
        : {
            ...base,
            workType: "daily_wage",
            ratePaise: money("ratePaise"),
            fullDays: count("fullDays"),
            halfDays: count("halfDays"),
            paidPaise: money("paidPaise"),
            advancesPaise: money("advancesPaise"),
          };
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`${id}-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    await onSave(entry);
    setBusy(false);
    setValues({ periodStart: today(), periodEnd: today() });
  };

  const field = (k: string, labelKey: string, opts: { inputMode?: "decimal" | "numeric"; type?: string } = {}) => (
    <div key={k}>
      <label htmlFor={`${id}-${k}`} className="block font-medium">
        {t(labelKey)}
      </label>
      {errors[k] ? (
        <p id={`${id}-${k}-err`} className="text-sm font-medium text-error">
          {errors[k]}
        </p>
      ) : null}
      <input
        id={`${id}-${k}`}
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        value={values[k] ?? ""}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `${id}-${k}-err` : `${id}-blank`}
        className={`tabular mt-1 min-h-12 w-full rounded-xl border-2 bg-surface px-3 ${errors[k] ? "border-error" : "border-control"}`}
      />
    </div>
  );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      <p id={`${id}-blank`} className="text-sm text-muted">
        {t("earnings.leaveBlank")}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {field("periodStart", "intake.periodStart", { type: "date" })}
        {field("periodEnd", "intake.periodEnd", { type: "date" })}
      </div>
      {field("platformLabel", "earnings.platform")}
      {mode === "platform" ? (
        <div className="grid grid-cols-2 gap-3">{PLATFORM_FIELDS.map(([k, label]) => field(k, label, { inputMode: "decimal" }))}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {field("ratePaise", "earnings.rate", { inputMode: "decimal" })}
          {field("fullDays", "earnings.fullDays", { inputMode: "numeric" })}
          {field("halfDays", "earnings.halfDays", { inputMode: "numeric" })}
          {DAILY_MONEY.slice(1).map(([k, label]) => field(k, label, { inputMode: "decimal" }))}
        </div>
      )}
      <Button type="submit" block size="lg" icon="plus" busy={busy}>
        {t("earnings.add")}
      </Button>
    </form>
  );
}

const STATE_LABEL: Record<SyncState, string> = {
  saved: "earnings.saved",
  device: "earnings.savedDevice",
  waiting: "earnings.waiting",
  syncing: "earnings.syncing",
  failed: "earnings.syncFailed",
};

export default function EarningsPage() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const { sharedDevice } = usePrefs();
  const online = useOnline();
  const announce = useAnnounce();
  const [mode, setMode] = useState<Mode>("platform");
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [consent, setConsent] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    setConsent(deviceConsent());
    if (!user) {
      setEntries(readDeviceEntries().map((e) => ({ ...e, state: "device" })));
      return;
    }
    const queued = readQueue();
    try {
      if (navigator.onLine && queued.length) {
        const r = await flushQueue();
        if (r.sent) announce(t("earnings.saved"));
      }
      const server = await fetchEntries();
      setLoadError(false);
      setEntries([...readQueue(), ...server.map((e) => ({ ...e, state: "saved" as const }))]);
    } catch {
      setLoadError(true);
      setEntries(readQueue());
    }
  }, [user, announce, t]);

  useEffect(() => {
    void refresh();
  }, [refresh, online]);

  const save = async (input: EarningsEntryInput) => {
    const local: LocalEntry = { ...input, createdAt: new Date().toISOString(), state: "syncing" };
    if (!user) {
      saveDeviceEntry({ ...local, state: "device" });
      announce(t("earnings.savedDevice"));
      return refresh();
    }
    if (!navigator.onLine) {
      enqueue(local);
      announce(t("earnings.waiting"));
      return refresh();
    }
    setEntries((x) => [local, ...x]);
    try {
      await pushEntry(input);
      announce(t("earnings.saved"));
    } catch (e) {
      // Same client id on retry, so a timeout after a successful save cannot duplicate it.
      enqueue(local);
      announce(e instanceof ApiError && !e.retryable ? t("earnings.syncFailed") : t("earnings.waiting"));
    }
    await refresh();
  };

  const remove = async (e: LocalEntry) => {
    if (!user) {
      removeDeviceEntry(e.clientId);
      return refresh();
    }
    if (e.id) await api(`/api/earnings/${e.id}`, { method: "DELETE" }).catch(() => null);
    await refresh();
  };

  const visible = entries.filter((e) => e.workType === mode);
  const platformSummary = summarizePlatform(visible.filter((e) => e.workType === "platform") as unknown as Parameters<typeof summarizePlatform>[0]);
  const dailySummary = summarizeDaily(visible.filter((e) => e.workType === "daily_wage") as unknown as Parameters<typeof summarizeDaily>[0]);
  const anyIncomplete = mode === "platform" ? !platformSummary.earned.complete || !platformSummary.expenses.complete || !platformSummary.payout.complete : !dailySummary.earned.complete || !dailySummary.received.complete;

  return (
    <AppShell>
      <h1 className="pt-2 text-3xl font-semibold tracking-tight">{t("earnings.title")}</h1>
      <p className="mt-1 text-muted">{t("earnings.intro")}</p>

      <div role="group" aria-label={t("earnings.title")} className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-sunken p-1">
        {(["platform", "daily_wage"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-11 rounded-full font-semibold ${mode === m ? "bg-surface text-ink shadow-[var(--shadow-card)]" : "text-muted"}`}
          >
            {m === "platform" ? t("earnings.modePlatform") : t("earnings.modeDaily")}
          </button>
        ))}
      </div>

      {!user ? (
        <Card className="mt-4 bg-sunken shadow-none">
          <p>{t("earnings.deviceOnlyNote")}</p>
          {!sharedDevice ? (
            <label className="mt-2 flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setDeviceConsent(e.target.checked);
                  void refresh();
                }}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                <span className="font-medium">{t("earnings.deviceConsent")}</span>
                <span className="block text-sm text-muted">{t("earnings.deviceConsentNote")}</span>
              </span>
            </label>
          ) : null}
        </Card>
      ) : null}
      {loadError ? (
        <Notice tone="attention" className="mt-4">
          {t("error.network")}
        </Notice>
      ) : null}

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">{t("earnings.summary")}</h2>
        {mode === "platform" ? (
          <dl className="tabular mt-3 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-sm text-muted">{t("earnings.earned")}</dt>
              <dd className="text-xl font-semibold">
                <TotalValue total={visible.length ? platformSummary.earned : null} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("earnings.paidOut")}</dt>
              <dd className="text-xl font-semibold">
                <TotalValue total={visible.length ? platformSummary.payout : null} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("earnings.spent")}</dt>
              <dd className="text-xl font-semibold">
                <TotalValue total={visible.length ? platformSummary.expenses : null} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("earnings.afterExpenses")}</dt>
              <dd className="text-xl font-semibold">
                <TotalValue total={visible.length ? platformSummary.afterExpenses : null} />
              </dd>
            </div>
          </dl>
        ) : (
          <dl className="tabular mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
            <div>
              <dt className="text-sm text-muted">{t("earnings.earned")}</dt>
              <dd className="text-xl font-semibold">
                <TotalValue total={visible.length ? dailySummary.earned : null} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("earnings.paid")}</dt>
              <dd className="text-xl font-semibold">
                <TotalValue total={visible.length ? dailySummary.received : null} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t("earnings.balance")}</dt>
              <dd className="text-xl font-semibold">
                <TotalValue total={dailySummary.balance !== null && visible.length ? { value: dailySummary.balance, complete: true } : null} />
              </dd>
            </div>
          </dl>
        )}
        {anyIncomplete && visible.length ? <p className="mt-3 text-sm text-attention-ink">* {t("earnings.unknownNote")}</p> : null}
        <p className="mt-3 text-sm text-muted">{mode === "platform" ? t("earnings.payoutVsEarnings") : t("earnings.workerStatement")}</p>
        {mode === "platform" ? <p className="mt-1 text-sm text-muted">{t("earnings.noHourly")}</p> : null}
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">{t("earnings.add")}</h2>
        <EntryForm mode={mode} onSave={save} />
      </Card>

      <section aria-labelledby="entries" className="mt-6">
        <h2 id="entries" className="text-lg font-semibold">
          {t("earnings.period")}
        </h2>
        {visible.length === 0 ? <p className="mt-2 text-muted">{t("earnings.empty")}</p> : null}
        <ul className="mt-3 space-y-3">
          {visible.map((e) => (
            <Card as="li" key={e.clientId} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {formatDateLabel(e.periodStart, locale)}
                    {e.periodEnd !== e.periodStart ? ` – ${formatDateLabel(e.periodEnd, locale)}` : ""}
                  </p>
                  <p className="text-sm text-muted">
                    {e.platformLabel ?? ""} {e.platformLabel ? "·" : ""} {t("earnings.source_worker_entered")}
                  </p>
                  <p className="tabular mt-1">
                    {e.workType === "platform"
                      ? `${t("earnings.gross")}: ${e.grossPaise !== null ? formatINR(e.grossPaise) : t("app.unknown")} · ${t("earnings.payout")}: ${e.payoutPaise !== null ? formatINR(e.payoutPaise) : t("app.unknown")}`
                      : `${t("earnings.rate")}: ${e.ratePaise !== null ? formatINR(e.ratePaise) : t("app.unknown")} · ${t("earnings.fullDays")}: ${e.fullDays ?? t("app.unknown")}`}
                  </p>
                  <div className="mt-2">
                    <Badge tone={e.state === "saved" ? "success" : e.state === "failed" ? "error" : "attention"}>
                      {e.state === "waiting" ? <Icon name="wifiOff" size={14} /> : null}
                      {t(STATE_LABEL[e.state])}
                    </Badge>
                  </div>
                </div>
                <Button size="sm" variant="ghost" icon="trash" aria-label={t("earnings.deleteEntry")} onClick={() => remove(e)}>
                  <span className="sr-only">{t("earnings.deleteEntry")}</span>
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
