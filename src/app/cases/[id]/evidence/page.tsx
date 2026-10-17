"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAnnounce, useT } from "@/app/providers";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, LinkButton, Notice } from "@/components/ui";
import { CaseFrame, ErrorNotice, type CaseCtx } from "@/features/cases/CaseFrame";
import { caseClient, newIdempotencyKey } from "@/features/cases/client";
import { checkLocalFile, MAX_FILES, uploadEvidence } from "@/features/evidence/upload";
import { sampleDocUrl } from "@/fixtures/demo";
import { ApiError } from "@/shared/errors";

interface Staged {
  key: string;
  file: File;
  preview: string;
  redacted: boolean;
  status: "staged" | "uploading" | "uploaded" | "failed";
}

function Tips() {
  const { t } = useT();
  return (
    <Card>
      <p className="font-semibold">{t("evidence.intro")}</p>
      <ul className="mt-2 space-y-1">
        {["evidence.tip1", "evidence.tip2", "evidence.tip3"].map((k) => (
          <li key={k} className="flex gap-2">
            <Icon name="check" size={20} className="mt-0.5 shrink-0 text-primary" />
            {t(k)}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted">{t("evidence.crop")}</p>
    </Card>
  );
}

function DemoEvidence({ ctx }: { ctx: CaseCtx }) {
  const { c, mutate, busy } = ctx;
  const { t } = useT();
  const announce = useAnnounce();
  const [liveError, setLiveError] = useState<string | null>(null);
  const live = c.events.some((e) => e.type === "records_read" && e.meta?.live === 1);

  const readLive = async () => {
    setLiveError(null);
    announce(t("evidence.reading"));
    try {
      await mutate("live", (cur) => caseClient.readSampleLive(cur), (r) => r, { rethrow: true });
      announce(t("evidence.readDone"));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "internal";
      setLiveError(code === "not_configured" || code === "ai_unavailable" ? t("evidence.liveUnavailable") : t("error.generic"));
      announce(t("evidence.liveUnavailable"));
    }
  };

  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {c.evidence.map((e) => (
          <li key={e.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element -- static fictional sample */}
            <img src={sampleDocUrl(e.id) ?? ""} alt={e.filename} className="h-36 w-full object-cover object-top" />
            <div className="p-2">
              <p className="truncate text-sm font-medium">{e.filename}</p>
              <Badge tone="attention">{t("evidence.sampleLabel")}</Badge>
            </div>
          </li>
        ))}
      </ul>
      {live ? (
        <Notice tone="success" className="mt-4" icon="sparkle">
          {t("evidence.liveResult")}
        </Notice>
      ) : (
        <Notice tone="demo" className="mt-4" title={t("evidence.recordedResult")}>
          {t("evidence.recordedResultNote")}
        </Notice>
      )}
      {liveError ? (
        <Notice tone="info" className="mt-3">
          {liveError}
        </Notice>
      ) : null}
      <div className="mt-5 space-y-3">
        <LinkButton href={`/cases/${c.id}/review`} size="lg" block>
          {t("app.continue")}
        </LinkButton>
        {c.fixtureId !== "E" ? (
          <Button variant="secondary" block icon="sparkle" busy={busy === "live"} onClick={readLive}>
            {t("evidence.liveRead")}
          </Button>
        ) : null}
      </div>
    </>
  );
}

function PrivateEvidence({ ctx }: { ctx: CaseCtx }) {
  const { c, reload } = ctx;
  const { t } = useT();
  const announce = useAnnounce();
  const router = useRouter();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<ApiError | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const extractKey = useRef<string>(newIdempotencyKey());
  const existing = c.evidence.filter((e) => e.status !== "deleting");

  useEffect(() => () => staged.forEach((s) => URL.revokeObjectURL(s.preview)), [staged]);

  const add = (files: FileList | null) => {
    if (!files) return;
    const errs: string[] = [];
    const next: Staged[] = [];
    for (const f of Array.from(files)) {
      if (existing.length + staged.length + next.length >= MAX_FILES) {
        errs.push(t("evidence.tooMany"));
        break;
      }
      const chk = checkLocalFile(f);
      if (!chk.ok) {
        errs.push(t(`evidence.${chk.reason}`, { name: f.name }));
        continue;
      }
      next.push({ key: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f), redacted: false, status: "staged" });
    }
    setErrors(errs);
    setStaged((s) => [...s, ...next]);
  };

  const uploadAll = async () => {
    for (const s of staged.filter((x) => x.status === "staged" || x.status === "failed")) {
      setStaged((all) => all.map((x) => (x.key === s.key ? { ...x, status: "uploading" } : x)));
      announce(`${t("evidence.status_uploading")}: ${s.file.name}`);
      try {
        await uploadEvidence(c.id, s.file, s.redacted);
        setStaged((all) => all.filter((x) => x.key !== s.key));
        announce(`${t("evidence.status_uploaded")}: ${s.file.name}`);
      } catch {
        setStaged((all) => all.map((x) => (x.key === s.key ? { ...x, status: "failed" } : x)));
        announce(`${t("evidence.status_failed")}: ${s.file.name}`);
      }
    }
    await reload();
  };

  const read = async () => {
    setReading(true);
    setReadError(null);
    announce(t("evidence.reading"));
    try {
      await caseClient.extract(c, extractKey.current);
      announce(t("evidence.readDone"));
      router.push(`/cases/${c.id}/review`);
    } catch (e) {
      setReadError(e instanceof ApiError ? e : new ApiError("internal", "failed", 0, true));
      // A failed read may be retried with a new key; a repeated tap during the same attempt reuses the old one.
      extractKey.current = newIdempotencyKey();
    } finally {
      setReading(false);
    }
  };

  const remove = async (evidenceId: string) => {
    await ctx.mutate("remove", async (cur) => {
      await fetch(`/api/cases/${cur.id}/evidence/${evidenceId}`, { method: "DELETE", credentials: "same-origin" });
      return (await caseClient.get(cur.id))!;
    });
  };

  const unread = existing.some((e) => e.status === "uploaded" || e.status === "failed");

  return (
    <>
      <p className="mt-4 text-sm text-muted">{t("evidence.limits")}</p>
      {errors.length ? (
        <Notice tone="error" className="mt-3" title={t("review.errorSummary")}>
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" icon="camera" onClick={() => cameraRef.current?.click()}>
          {t("evidence.camera")}
        </Button>
        <Button variant="secondary" icon="image" onClick={() => galleryRef.current?.click()}>
          {t("evidence.gallery")}
        </Button>
      </div>
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {staged.length || existing.length ? (
        <ul className="mt-4 space-y-3">
          {existing.map((e) => (
            <Card as="li" key={e.id} className="flex items-center gap-3 p-3">
              <Icon name="doc" className="shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{e.filename}</p>
                <p className="text-sm text-muted">{t(`evidence.status_${e.status}`)}{e.metadataNote ? ` · ${e.metadataNote}` : ""}</p>
              </div>
              <Button size="sm" variant="ghost" icon="trash" aria-label={`${t("app.remove")}: ${e.filename}`} onClick={() => remove(e.id)}>
                {t("app.remove")}
              </Button>
            </Card>
          ))}
          {staged.map((s) => (
            <Card as="li" key={s.key} className="p-3">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={s.preview} alt="" className="h-20 w-16 shrink-0 rounded-lg border border-border object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.file.name}</p>
                  <p className="text-sm text-muted" aria-live="off">
                    {s.status === "staged" ? "" : t(`evidence.status_${s.status === "uploaded" ? "uploaded" : s.status}`)}
                  </p>
                  <label className="mt-1 flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[var(--color-primary)]"
                      checked={s.redacted}
                      onChange={(e) => setStaged((all) => all.map((x) => (x.key === s.key ? { ...x, redacted: e.target.checked } : x)))}
                    />
                    {t("evidence.redacted")}
                  </label>
                  {s.redacted ? <p className="text-sm text-muted">{t("evidence.redactedNote")}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="x"
                  aria-label={`${t("app.remove")}: ${s.file.name}`}
                  disabled={s.status === "uploading"}
                  onClick={() => setStaged((all) => all.filter((x) => x.key !== s.key))}
                >
                  {t("app.remove")}
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      ) : null}

      <p className="mt-4 text-sm text-muted">{t("evidence.original")}</p>

      <div className="mt-5 space-y-3">
        {staged.length ? (
          <Button size="lg" block onClick={uploadAll} busy={staged.some((s) => s.status === "uploading")}>
            {t("evidence.upload", { count: staged.length })}
          </Button>
        ) : null}
        {!staged.length && unread ? (
          <Button size="lg" block onClick={read} busy={reading}>
            {reading ? t("evidence.reading") : t("evidence.readRecords")}
          </Button>
        ) : null}
        {readError ? <ErrorNotice error={readError} onRetry={read} /> : null}
        {!staged.length && !unread && existing.length ? (
          <LinkButton href={`/cases/${c.id}/review`} size="lg" block>
            {t("app.continue")}
          </LinkButton>
        ) : null}
        <Link href={`/cases/${c.id}/review?manual=1`} className="block py-2 text-center font-medium text-primary underline underline-offset-4">
          {t("evidence.manual")}
        </Link>
        <p className="text-center text-sm text-muted">{t("evidence.manualNote")}</p>
      </div>
    </>
  );
}

export default function EvidencePage() {
  const { t } = useT();
  return (
    <CaseFrame title={t("evidence.title")} backHref={(id) => `/cases/${id}`}>
      {(ctx) => (
        <>
          <h1 className="text-2xl font-semibold">{t("evidence.title")}</h1>
          <div className="mt-4">
            <Tips />
          </div>
          {ctx.error ? (
            <div className="mt-3">
              <ErrorNotice error={ctx.error} onRetry={ctx.reload} />
            </div>
          ) : null}
          {ctx.c.mode === "demo" ? <DemoEvidence ctx={ctx} /> : <PrivateEvidence ctx={ctx} />}
        </>
      )}
    </CaseFrame>
  );
}
