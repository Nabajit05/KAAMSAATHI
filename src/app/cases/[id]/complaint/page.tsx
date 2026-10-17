"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAnnounce, useAuth, useT } from "@/app/providers";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, LinkButton, Notice } from "@/components/ui";
import { isCheckStale, isComplaintApproved, isComplaintStale, type Locale } from "@/domain/case";
import { CaseFrame, ErrorNotice, type CaseCtx } from "@/features/cases/CaseFrame";
import { caseClient, newIdempotencyKey } from "@/features/cases/client";
import { ListenButton } from "@/features/speech/ListenButton";
import type { DraftResponse } from "@/shared/contracts";

function ComplaintBody({ ctx }: { ctx: CaseCtx }) {
  const { c, mutate, busy, error, reload } = ctx;
  const { t, locale } = useT();
  const { user } = useAuth();
  const announce = useAnnounce();
  const [draftLocale, setDraftLocale] = useState<Locale>(c.complaint?.locale ?? locale);
  const [text, setText] = useState(c.complaint?.text ?? "");
  const [note, setNote] = useState<DraftResponse["note"]>(null);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const draftKey = useRef(newIdempotencyKey());
  const textId = useId();
  const d = c.complaint;
  const approved = isComplaintApproved(d);
  const stale = isComplaintStale(c);
  const dirty = !!d && text !== d.text;

  useEffect(() => {
    setText(c.complaint?.text ?? "");
  }, [c.complaint?.id, c.complaint?.revision, c.complaint?.text]);

  if (!c.check || isCheckStale(c)) {
    return (
      <>
        <Notice tone="attention">{t("result.stale")}</Notice>
        <LinkButton href={`/cases/${c.id}/review`} className="mt-4">
          {t("review.title")}
        </LinkButton>
      </>
    );
  }

  const generate = async () => {
    announce(t("complaint.generating"));
    const r = await mutate(
      "draft",
      (cur) => caseClient.draftComplaint(cur, draftLocale, draftKey.current),
      (x) => x.case,
    );
    draftKey.current = newIdempotencyKey();
    if (r) {
      setNote(r.note);
      announce(t("complaint.title"));
    }
  };

  const saveText = () => (dirty ? mutate("save", (cur) => caseClient.setComplaintText(cur, text)) : Promise.resolve(c));

  const approve = async () => {
    const saved = await saveText();
    if (saved) await mutate("approve", (cur) => caseClient.approveComplaint(cur));
    announce(t("complaint.approved"));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(d!.text);
      setCopied(true);
      announce(t("complaint.copied"));
      setTimeout(() => setCopied(false), 3000);
      await mutate("export", (cur) => caseClient.markExported(cur, "copy"));
    } catch {
      // Clipboard can be blocked; select the text so the worker can copy it with the phone's own menu.
      const el = document.getElementById(textId) as HTMLTextAreaElement | null;
      el?.focus();
      el?.select();
      setCopyFallback(true);
      announce(t("complaint.copyFallback"));
    }
  };

  const share = async () => {
    try {
      await navigator.share({ text: d!.text });
      await mutate("export", (cur) => caseClient.markExported(cur, "share"));
    } catch {
      /* user cancelled share sheet */
    }
  };

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("complaint.title")}</h1>
      <p className="mt-1 text-muted">{t("complaint.intro")}</p>

      {error ? (
        <div className="mt-4">
          <ErrorNotice error={error} onRetry={reload} />
        </div>
      ) : null}

      <fieldset className="mt-5">
        <legend className="font-semibold">{t("complaint.language")}</legend>
        <div className="mt-2 flex gap-2">
          {(["hi", "en"] as Locale[]).map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={draftLocale === l}
              onClick={() => setDraftLocale(l)}
              className={`min-h-11 rounded-full border px-5 font-medium ${draftLocale === l ? "border-primary bg-primary text-white" : "border-control bg-surface"}`}
            >
              {l === "hi" ? "हिंदी" : "English"}
            </button>
          ))}
        </div>
      </fieldset>

      {!d || stale || d.locale !== draftLocale ? (
        <>
          {stale ? (
            <Notice tone="attention" className="mt-4">
              {t("complaint.stale")}
            </Notice>
          ) : null}
          <Button size="lg" block className="mt-5" icon="sparkle" busy={busy === "draft"} onClick={generate}>
            {busy === "draft" ? t("complaint.generating") : t("complaint.generate")}
          </Button>
        </>
      ) : null}

      {d ? (
        <Card className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={d.source === "ai" ? "primary" : d.source === "recorded_demo" ? "attention" : "neutral"}>{t(`complaint.source_${d.source}`)}</Badge>
            {approved ? <Badge tone="success">✓ {t("complaint.approved")}</Badge> : null}
          </div>
          {note === "template_fallback" ? <p className="mt-2 text-sm text-muted">{t("complaint.templateNote")}</p> : null}
          {note === "validation_blocked" ? <p className="mt-2 text-sm text-muted">{t("complaint.validationBlocked")}</p> : null}
          {note === "repaired" ? <p className="mt-2 text-sm text-muted">{t("complaint.repairedNote")}</p> : null}

          <label htmlFor={textId} className="mt-4 block font-semibold">
            {t("complaint.textLabel")}
          </label>
          <p id={`${textId}-hint`} className="text-sm text-muted">
            {t("complaint.placeholdersNote")}
          </p>
          <textarea
            id={textId}
            lang={d.locale}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => void saveText()}
            aria-describedby={`${textId}-hint`}
            rows={16}
            className="mt-2 w-full rounded-xl border-2 border-control bg-surface p-3 text-base leading-relaxed"
          />
          {d.approvedRevision !== null && !approved ? (
            <p className="mt-2 text-sm text-attention-ink">{t("complaint.unapproved")}</p>
          ) : null}

          {!approved ? (
            <Button block className="mt-3" icon="check" disabled={stale} busy={busy === "approve" || busy === "save"} onClick={approve}>
              {t("complaint.approve")}
            </Button>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button variant="secondary" icon="copy" disabled={!approved || dirty} onClick={copy}>
              {copied ? t("complaint.copied") : t("complaint.copy")}
            </Button>
            {canShare ? (
              <Button variant="secondary" icon="share" disabled={!approved || dirty} onClick={share}>
                {t("complaint.share")}
              </Button>
            ) : null}
            <LinkButton
              href={`/cases/${c.id}/print`}
              variant="secondary"
              icon="print"
              aria-disabled={!approved || dirty}
              className={!approved || dirty ? "pointer-events-none opacity-50" : ""}
              tabIndex={!approved || dirty ? -1 : undefined}
            >
              {t("complaint.print")}
            </LinkButton>
          </div>
          {!approved ? <p className="mt-2 text-sm text-muted">{t("complaint.approveFirst")}</p> : null}
          {copyFallback ? <p className="mt-2 text-sm font-medium">{t("complaint.copyFallback")}</p> : null}
          <p className="mt-3 text-sm font-medium">{t("complaint.exportIsNotSubmit")}</p>
          {user && c.mode === "private" ? (
            <div className="mt-3">
              <ListenButton text={d.text} locale={d.locale} />
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">{t("complaint.supportTitle")}</h2>
        <p className="mt-1">{t("complaint.supportBody")}</p>
        {c.mode === "demo" ? <p className="mt-2 text-sm text-attention-ink">{t("complaint.supportDemo")}</p> : null}
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">{t("complaint.evidenceSummary")}</h2>
        <ul className="mt-2 space-y-1">
          {c.evidence.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <Icon name="doc" size={18} className="text-muted" />
              {e.filename}
            </li>
          ))}
        </ul>
      </Card>

      {d?.exportedAt ? (
        <LinkButton href={`/cases/${c.id}`} variant="dark" size="lg" block className="mt-5">
          {t("caseDetail.iSubmitted")}
        </LinkButton>
      ) : null}
    </>
  );
}

export default function ComplaintPage() {
  const { t } = useT();
  return (
    <CaseFrame title={t("complaint.title")} backHref={(id) => `/cases/${id}/result`}>
      {(ctx) => <ComplaintBody ctx={ctx} />}
    </CaseFrame>
  );
}
