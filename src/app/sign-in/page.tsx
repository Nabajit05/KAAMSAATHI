"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Button, Card, LinkButton, Notice } from "@/components/ui";
import { normalizeIndianMobile, safeNext } from "@/lib/phone";
import { authMethod } from "@/lib/publicConfig";
import { emailLinkClient, supabaseBrowser } from "@/lib/supabaseBrowser";
import { useAnnounce, useAuth, usePrefs, useT } from "../providers";

const CONSENT_VERSION = "2026-10-17";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function SignInForm() {
  const { t } = useT();
  const { configured } = useAuth();
  const { sharedDevice, setSharedDevice } = usePrefs();
  const announce = useAnnounce();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const linkFailed = params.get("error") === "link";
  const id = useId();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const isEmail = authMethod === "email";
  const email = phone.trim().toLowerCase();
  const normalized = isEmail ? (EMAIL_RE.test(email) ? email : null) : normalizeIndianMobile(phone);
  const shown = isEmail ? email : `+91 ${normalized}`;
  const identity = isEmail ? { email } : { phone: `+91${normalized}` };

  if (!configured) {
    return (
      <>
        <Notice tone="info" title={t("auth.unavailable")} />
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/demo">{t("welcome.tryExample")}</LinkButton>
          <LinkButton href="/help" variant="secondary">
            {t("nav.help")}
          </LinkButton>
        </div>
      </>
    );
  }

  const showErrors = (e: Record<string, string>) => {
    setErrors(e);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const sendCode = async () => {
    const e: Record<string, string> = {};
    if (!normalized) e.phone = t(isEmail ? "auth.invalidEmail" : "auth.invalidPhone");
    if (!agreed) e.consent = t("auth.consentAgree");
    if (Object.keys(e).length) return showErrors(e);
    setErrors({});
    setFormError(null);
    setBusy(true);
    // Email links use the implicit flow so they work in any browser or mail app;
    // phone codes are verified in this browser.
    const { error } = await (isEmail ? emailLinkClient() : supabaseBrowser()!).auth.signInWithOtp({
      ...identity,
      options: {
        shouldCreateUser: true,
        // Email: Supabase sends a sign-in link that returns to our callback.
        ...(isEmail ? { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` } : {}),
      },
    });
    setBusy(false);
    if (error) {
      setFormError(error.status === 429 ? t("auth.rateLimited") : t("error.generic"));
      return;
    }
    setStep("code");
    announce(t(isEmail ? "auth.codeHintEmail" : "auth.codeHint", { phone: shown }));
  };

  const verify = async () => {
    const token = code.replace(/\D/g, "");
    if (token.length < 6 || token.length > 8) return showErrors({ code: t("auth.invalidCode") });
    setErrors({});
    setFormError(null);
    setBusy(true);
    const sb = supabaseBrowser()!;
    const { data, error } = isEmail
      ? await sb.auth.verifyOtp({ email, token, type: "email" })
      : await sb.auth.verifyOtp({ phone: `+91${normalized}`, token, type: "sms" });
    if (error || !data.user) {
      setBusy(false);
      setFormError(error?.status === 429 ? t("auth.rateLimited") : t("auth.failed"));
      return;
    }
    await sb.from("profiles").upsert({ user_id: data.user.id, shared_device: sharedDevice, consent_version: CONSENT_VERSION, consented_at: new Date().toISOString() });
    router.replace(next);
    router.refresh();
  };

  return (
    <>
      {Object.keys(errors).length ? (
        <div ref={summaryRef} tabIndex={-1} className="mb-4">
          <Notice tone="error" title={t("review.errorSummary")}>
            <ul className="list-disc pl-5">
              {Object.entries(errors).map(([k, v]) => (
                <li key={k}>
                  <a href={`#${id}-${k}`} className="underline">
                    {v}
                  </a>
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      ) : null}
      {linkFailed ? (
        <Notice tone="error" className="mb-4">
          {t("auth.linkFailed")}
        </Notice>
      ) : null}
      {formError ? (
        <Notice tone="error" className="mb-4">
          {formError}
        </Notice>
      ) : null}

      {step === "phone" ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
          className="space-y-5"
        >
          <div>
            <label htmlFor={`${id}-phone`} className="block font-semibold">
              {t(isEmail ? "auth.email" : "auth.phone")}
            </label>
            <p id={`${id}-phone-hint`} className="text-sm text-muted">
              {t(isEmail ? "auth.emailHint" : "auth.phoneHint")}
            </p>
            {errors.phone ? (
              <p id={`${id}-phone-err`} className="font-medium text-error">
                {errors.phone}
              </p>
            ) : null}
            <div className="mt-1 flex items-stretch gap-2">
              {!isEmail ? (
                <span className="inline-flex min-h-12 items-center rounded-xl bg-sunken px-3 font-semibold" aria-hidden>
                  +91
                </span>
              ) : null}
              <input
                id={`${id}-phone`}
                type={isEmail ? "email" : "tel"}
                inputMode={isEmail ? "email" : "tel"}
                autoComplete={isEmail ? "email" : "tel-national"}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={`${id}-phone-hint${errors.phone ? ` ${id}-phone-err` : ""}`}
                className={`tabular min-h-12 w-full rounded-xl border-2 px-3 text-lg ${errors.phone ? "border-error" : "border-control"}`}
              />
            </div>
          </div>

          <Card className="space-y-2 bg-sunken shadow-none">
            <h2 className="font-semibold">{t("auth.consentTitle")}</h2>
            <p>{t("auth.consentWho")}</p>
            <p>{t("auth.consentWhy")}</p>
            <p>{t("auth.consentDelete")}</p>
            <label className="flex min-h-11 items-start gap-3 pt-2 font-medium" id={`${id}-consent`}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-primary)]" aria-invalid={errors.consent ? true : undefined} />
              {t("auth.consentAgree")}
            </label>
          </Card>

          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" checked={sharedDevice} onChange={(e) => setSharedDevice(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-primary)]" />
            <span>
              <span className="font-medium">{t("auth.sharedPhone")}</span>
              <span className="block text-sm text-muted">{t("auth.sharedPhoneNote")}</span>
            </span>
          </label>

          <Button type="submit" size="lg" block busy={busy}>
            {busy ? t("auth.sending") : t("auth.sendCode")}
          </Button>
        </form>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
          className="space-y-5"
        >
          {isEmail ? (
            <Notice tone="success" title={t("auth.checkEmail", { email: shown })}>
              {t("auth.checkEmailBody")}
            </Notice>
          ) : null}
          <div>
            <label htmlFor={`${id}-code`} className="block font-semibold">
              {t(isEmail ? "auth.codeOptional" : "auth.code")}
            </label>
            <p id={`${id}-code-hint`} className="text-sm text-muted">
              {t(isEmail ? "auth.codeHintEmail" : "auth.codeHint", { phone: shown })}
            </p>
            {errors.code ? (
              <p id={`${id}-code-err`} className="font-medium text-error">
                {errors.code}
              </p>
            ) : null}
            {/* Paste and SMS autofill are allowed; no split boxes. */}
            <input
              id={`${id}-code`}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={errors.code ? true : undefined}
              aria-describedby={`${id}-code-hint${errors.code ? ` ${id}-code-err` : ""}`}
              className={`tabular mt-1 min-h-12 w-full rounded-xl border-2 px-3 text-2xl tracking-[0.3em] ${errors.code ? "border-error" : "border-control"}`}
            />
          </div>
          <Button type="submit" size="lg" block busy={busy}>
            {busy ? t("auth.verifying") : t("auth.verify")}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void sendCode()} disabled={busy}>
              {t("auth.resend")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep("phone");
                setCode("");
              }}
            >
              {t("auth.changeNumber")}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}

export default function SignInPage() {
  const { t } = useT();
  return (
    <AppShell variant="task" title={t("auth.title")} backHref="/">
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Icon name="shield" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">{t("auth.title")}</h1>
          <p className="text-muted">{t("auth.intro")}</p>
        </div>
      </div>
      <div className="mt-6">
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </AppShell>
  );
}
