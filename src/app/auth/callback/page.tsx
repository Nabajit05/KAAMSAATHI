"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LinkButton, Notice, Spinner } from "@/components/ui";
import { safeNext } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useT } from "../../providers";

/**
 * Landing page for the email sign-in link. Works in whichever browser opens
 * the link: Supabase returns the session in the URL fragment (never sent to
 * our server), we store it as the normal cookie session and remove it from
 * the address bar. A PKCE ?code= link is also accepted when opened in the
 * same browser that asked for it.
 */
export default function AuthCallbackPage() {
  const { t } = useT();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const run = async () => {
      const sb = supabaseBrowser();
      const url = new URL(window.location.href);
      const next = safeNext(url.searchParams.get("next"));
      const hash = new URLSearchParams(url.hash.slice(1));
      // Clear tokens from the address bar and history straight away.
      window.history.replaceState(null, "", url.pathname);
      if (!sb || hash.get("error") || url.searchParams.get("error")) return setFailed(true);

      let userId: string | null = null;
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      const code = url.searchParams.get("code");
      if (access_token && refresh_token) {
        const { data, error } = await sb.auth.setSession({ access_token, refresh_token });
        userId = error ? null : data.user?.id ?? null;
      } else if (code) {
        const { data, error } = await sb.auth.exchangeCodeForSession(code);
        userId = error ? null : data.user?.id ?? null;
      }
      if (!userId) return setFailed(true);
      await sb.from("profiles").upsert({ user_id: userId, consent_version: "2026-10-17", consented_at: new Date().toISOString() });
      router.replace(next);
      router.refresh();
    };
    void run();
  }, [router]);

  return (
    <AppShell variant="task" title={t("auth.title")} backHref="/">
      {failed ? (
        <>
          <Notice tone="error">{t("auth.linkFailed")}</Notice>
          <LinkButton href="/sign-in" className="mt-4">
            {t("auth.resend")}
          </LinkButton>
        </>
      ) : (
        <div className="py-10">
          <Spinner label={t("auth.verifying")} />
        </div>
      )}
    </AppShell>
  );
}
