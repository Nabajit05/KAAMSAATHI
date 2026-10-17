"use client";

import { useId, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, LinkButton, Notice } from "@/components/ui";
import type { Locale } from "@/domain/case";
import { clearDeviceData } from "@/lib/devicePrefs";
import { useAnnounce, useAuth, usePrefs, useT } from "../providers";

export default function SettingsPage() {
  const { t, locale, setLocale } = useT();
  const { user, configured, signOut } = useAuth();
  const { sharedDevice, setSharedDevice } = usePrefs();
  const announce = useAnnounce();
  const id = useId();
  const [confirmText, setConfirmText] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "busy" | "pending" | "error" | "unavailable">("idle");
  const [cleared, setCleared] = useState(false);
  const openBtn = useRef<HTMLButtonElement>(null);

  const deleteAccount = async () => {
    setDeleteState("busy");
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: confirmText }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.status === "deleted") {
        clearDeviceData();
        announce(t("settings.deleted"));
        await signOut();
        return;
      }
      if (res.status === 202) return setDeleteState("pending");
      setDeleteState(body?.error?.code === "not_configured" ? "unavailable" : "error");
    } catch {
      setDeleteState("error");
    }
  };

  return (
    <AppShell>
      <h1 className="pt-2 text-3xl font-semibold tracking-tight">{t("settings.title")}</h1>

      <Card className="mt-4 space-y-4">
        <fieldset>
          <legend className="font-semibold">{t("settings.language")}</legend>
          <div className="mt-2 flex gap-2">
            {(["hi", "en"] as Locale[]).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={locale === l}
                onClick={() => setLocale(l)}
                className={`min-h-12 flex-1 rounded-full border font-semibold ${locale === l ? "border-primary bg-primary text-white" : "border-control bg-surface"}`}
              >
                {l === "hi" ? "हिंदी" : "English"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-11 items-start gap-3">
          <input type="checkbox" checked={sharedDevice} onChange={(e) => setSharedDevice(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-primary)]" />
          <span>
            <span className="font-medium">{t("settings.sharedDevice")}</span>
            <span className="block text-sm text-muted">{t("settings.sharedDeviceNote")}</span>
          </span>
        </label>
        <p className="text-sm text-muted">{t("settings.audio")}: {t("complaint.listen")} — {t("app.optional")}</p>
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">{t("settings.dataTitle")}</h2>
        <dl className="mt-3 space-y-3">
          {(["collected", "purpose", "processors", "retention"] as const).map((k) => (
            <div key={k}>
              <dt className="font-medium">{t(`settings.${k}`)}</dt>
              <dd className="text-muted">{t(`settings.${k}Body`)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-muted">{t("settings.help")}</p>
        <p className="mt-2 text-sm font-medium text-attention-ink">{t("settings.pilotNote")}</p>
      </Card>

      <Card className="mt-4 space-y-3">
        {user ? (
          <>
            <p className="text-muted">{t("auth.signedInAs", { phone: user.phone ? `+${user.phone}` : user.email ?? "" })}</p>
            <a href="/api/account" download className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-control bg-surface font-semibold hover:bg-sunken">
              {t("settings.download")}
            </a>
            <Button variant="secondary" block onClick={() => void signOut()}>
              {t("auth.signOut")}
            </Button>
            {!deleteOpen ? (
              <Button ref={openBtn} variant="danger" block onClick={() => setDeleteOpen(true)}>
                {t("settings.deleteAccount")}
              </Button>
            ) : (
              <div role="alertdialog" aria-labelledby={`${id}-dq`} className="rounded-2xl border-2 border-error p-4">
                <p id={`${id}-dq`} className="font-semibold">
                  {t("settings.deleteAccountConfirm")}
                </p>
                <label htmlFor={`${id}-dt`} className="mt-3 block font-medium">
                  {t("settings.deleteAccountType")}
                </label>
                <input id={`${id}-dt`} autoFocus value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" className="mt-1 min-h-12 w-full rounded-xl border-2 border-control px-3" />
                <div className="mt-3 flex gap-2">
                  <Button variant="danger" disabled={confirmText !== "DELETE"} busy={deleteState === "busy"} onClick={deleteAccount}>
                    {t("settings.deleteAccount")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDeleteOpen(false);
                      setConfirmText("");
                      requestAnimationFrame(() => openBtn.current?.focus());
                    }}
                  >
                    {t("app.cancel")}
                  </Button>
                </div>
                {deleteState === "pending" ? <Notice tone="attention" className="mt-3">{t("caseDetail.deleteFailed")}</Notice> : null}
                {deleteState === "error" ? <Notice tone="error" className="mt-3">{t("error.generic")}</Notice> : null}
                {deleteState === "unavailable" ? <Notice tone="info" className="mt-3">{t("error.maintenance")}</Notice> : null}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-muted">{t("settings.signInForData")}</p>
            {configured ? <LinkButton href="/sign-in?next=/settings">{t("intake.signIn")}</LinkButton> : null}
          </>
        )}
        <Button
          variant="ghost"
          block
          onClick={() => {
            clearDeviceData({ keepPrefs: true });
            setCleared(true);
            announce(t("settings.cleared"));
          }}
        >
          {t("settings.clearDevice")}
        </Button>
        {cleared ? <p className="text-center text-sm text-success-ink">{t("settings.cleared")}</p> : null}
      </Card>
    </AppShell>
  );
}
