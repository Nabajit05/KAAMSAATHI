"use client";

import { useId, useRef, useState } from "react";
import { useT } from "@/app/providers";
import { Icon } from "@/components/Icon";
import { Badge, Button } from "@/components/ui";
import { applyWorkerEdit, chooseAlternative, confirmFact, FIELD_DEFS, markUnknown, type Fact, type FactValue, type FieldKey } from "@/domain/facts";
import { paiseToInput } from "@/domain/money";
import { parseFieldValue } from "@/domain/parseField";
import { ENUM_OPTIONS, formatFactValue } from "./fieldMeta";

function ProvenanceTag({ fact }: { fact: Fact }) {
  const { t } = useT();
  if (fact.reviewState === "unreadable") return <Badge tone="attention">{t("review.unreadable")}</Badge>;
  if (fact.reviewState === "conflict") return <Badge tone="attention">{t("review.conflict")}</Badge>;
  if (fact.reviewState === "unknown_confirmed") return <Badge>{t("review.unknownMarked")}</Badge>;
  if (fact.provenance === "record") return <Badge tone="primary">{t("review.fromRecord")}</Badge>;
  if (fact.provenance === "worker_stated") return <Badge>{t("review.yourAccount")}</Badge>;
  return <Badge>{t("review.enteredByYou")}</Badge>;
}

function initialText(key: FieldKey, value: FactValue): string {
  if (value === null) return "";
  const kind = FIELD_DEFS[key].kind;
  if ((kind === "money" || kind === "signed_money") && typeof value === "number") return paiseToInput(value);
  return String(value);
}

export function FactRow({
  fieldKey,
  fact,
  disabled,
  onChange,
  onViewSource,
  sourceName,
}: {
  fieldKey: FieldKey;
  fact: Fact | undefined;
  disabled?: boolean;
  onChange: (f: Fact) => void;
  onViewSource?: (docId: string, trigger: HTMLElement) => void;
  sourceName?: string | null;
}) {
  const { t, locale } = useT();
  const def = FIELD_DEFS[fieldKey];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initialText(fieldKey, fact?.value ?? null));
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;
  const editBtn = useRef<HTMLButtonElement>(null);
  const label = t(`field.${fieldKey}`);
  const help = t(`fieldHelp.${fieldKey}`);
  const hasHelp = !help.startsWith("fieldHelp.");
  const enumOptions = ENUM_OPTIONS[def.kind];
  const needsAnswer =
    !fact || fact.reviewState === "unreviewed" || fact.reviewState === "unreadable" || fact.reviewState === "conflict";

  const save = () => {
    const r = parseFieldValue(fieldKey, text);
    if (!r.ok) {
      setError(t(r.errorKey));
      return;
    }
    setError(null);
    onChange(applyWorkerEdit(fact, r.value));
    setEditing(false);
    requestAnimationFrame(() => editBtn.current?.focus());
  };

  const chooseEnum = (value: string) => onChange(applyWorkerEdit(fact, value));

  return (
    <li id={`f-${fieldKey}`} className="scroll-mt-24 border-t border-border py-4 first:border-t-0" data-field={fieldKey}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium" id={`${inputId}-label`}>
            {label}
            {!def.critical ? <span className="font-normal text-muted"> ({t("app.optional")})</span> : null}
          </p>
          {hasHelp ? (
            <p id={helpId} className="text-sm text-muted">
              {help}
            </p>
          ) : null}
        </div>
        {fact ? <ProvenanceTag fact={fact} /> : null}
      </div>

      {!editing ? (
        <p className="tabular mt-1 text-2xl font-semibold">{fact ? formatFactValue(fieldKey, fact.value, locale, t) : <span className="text-lg font-normal text-muted">{t("app.notRecorded")}</span>}</p>
      ) : null}

      {fact?.sourceExcerpt ? (
        <p className="mt-1 text-sm text-muted">
          {t("review.quote")}: <q lang="en" className="text-ink">{fact.sourceExcerpt}</q>
          {fact.sourceDocumentId && onViewSource ? (
            <>
              {" · "}
              <button
                type="button"
                className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-2"
                onClick={(e) => onViewSource(fact.sourceDocumentId!, e.currentTarget)}
              >
                {sourceName ? t("evidence.view", { name: sourceName }) : t("result.viewEvidence")}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {fact?.unknownReason ? <p className="mt-1 text-sm text-attention-ink">{fact.unknownReason} {t("review.whichDocHelps")}</p> : null}

      {fact?.reviewState === "conflict" && fact.alternative ? (
        <fieldset className="mt-3 rounded-2xl bg-attention p-3">
          <legend className="sr-only">{label}</legend>
          <p className="font-medium text-attention-ink">
            {t("review.conflictQ", {
              a: formatFactValue(fieldKey, fact.value, locale, t),
              b: formatFactValue(fieldKey, fact.alternative.value, locale, t),
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onChange(chooseAlternative(fact, false))}>
              {t("review.useRecord", { a: formatFactValue(fieldKey, fact.value, locale, t) })}
            </Button>
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => onChange(chooseAlternative(fact, true))}>
              {t("review.useMine", { b: formatFactValue(fieldKey, fact.alternative.value, locale, t) })}
            </Button>
          </div>
        </fieldset>
      ) : null}

      {enumOptions && !editing ? (
        <fieldset className="mt-3">
          <legend className="sr-only">{label}</legend>
          <div className="flex flex-wrap gap-2">
            {enumOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                aria-pressed={fact?.value === o.value && !needsAnswer}
                onClick={() => chooseEnum(o.value)}
                className={`min-h-11 rounded-full border px-4 text-[0.95rem] font-medium ${
                  fact?.value === o.value && !needsAnswer ? "border-primary bg-primary text-white" : "border-control bg-surface hover:bg-sunken"
                }`}
              >
                {t(o.labelKey)}
              </button>
            ))}
            <button
              type="button"
              disabled={disabled}
              aria-pressed={fact?.reviewState === "unknown_confirmed"}
              onClick={() => onChange(markUnknown(fact))}
              className={`min-h-11 rounded-full border px-4 text-[0.95rem] font-medium ${
                fact?.reviewState === "unknown_confirmed" ? "border-ink bg-ink text-white" : "border-control bg-surface hover:bg-sunken"
              }`}
            >
              {t("app.dontKnow")}
            </button>
          </div>
        </fieldset>
      ) : null}

      {editing && !enumOptions ? (
        <div className="mt-2">
          <label htmlFor={inputId} className="sr-only">
            {label}
          </label>
          {error ? (
            <p id={errorId} className="mb-1 flex items-center gap-1 font-medium text-error">
              <Icon name="alert" size={18} />
              {error}
            </p>
          ) : null}
          <input
            id={inputId}
            autoFocus
            type={def.kind === "date" ? "date" : "text"}
            inputMode={def.kind === "count" ? "numeric" : def.kind === "date" ? undefined : "decimal"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setEditing(false);
                setError(null);
                requestAnimationFrame(() => editBtn.current?.focus());
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={[error ? errorId : null, hasHelp ? helpId : null].filter(Boolean).join(" ") || undefined}
            className={`tabular min-h-12 w-full rounded-xl border-2 bg-surface px-3 text-lg ${error ? "border-error" : "border-control"}`}
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={save}>
              {t("app.save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError(null);
                requestAnimationFrame(() => editBtn.current?.focus());
              }}
            >
              {t("app.cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {!editing && !enumOptions && fact?.reviewState !== "conflict" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {needsAnswer && fact && fact.value !== null ? <span className="w-full text-sm font-medium">{t("review.isCorrect")}</span> : null}
          {fact && fact.value !== null && fact.reviewState !== "confirmed" && fact.reviewState !== "edited" ? (
            <Button size="sm" variant="primary" icon="check" disabled={disabled} onClick={() => onChange(confirmFact(fact))}>
              {t("review.correct")}
            </Button>
          ) : null}
          <Button
            ref={editBtn}
            size="sm"
            variant="secondary"
            icon="edit"
            disabled={disabled}
            aria-label={`${t("review.change")}: ${label}`}
            onClick={() => {
              setText(initialText(fieldKey, fact?.value ?? null));
              setEditing(true);
            }}
          >
            {t("review.change")}
          </Button>
          {fact?.reviewState !== "unknown_confirmed" ? (
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(markUnknown(fact))}>
              {t("app.dontKnow")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
