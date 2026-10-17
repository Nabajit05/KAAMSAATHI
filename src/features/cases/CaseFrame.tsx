"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "@/app/providers";
import { AppShell } from "@/components/AppShell";
import { LinkButton, Notice, Spinner } from "@/components/ui";
import type { CaseRecord } from "@/domain/case";
import { errorMessageKey, type ApiError } from "@/shared/errors";
import { useCaseRecord } from "./useCases";

export function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const { t } = useT();
  const key = error.message === "network" ? errorMessageKey("network") : errorMessageKey(error.code);
  return (
    <Notice tone="error" title={t(key)}>
      {error.requestId ? <p className="text-sm">{t("error.reference", { id: error.requestId })}</p> : null}
      {onRetry && error.retryable ? (
        <button type="button" onClick={onRetry} className="mt-1 font-semibold underline underline-offset-2">
          {t("app.retry")}
        </button>
      ) : null}
    </Notice>
  );
}

export type CaseCtx = ReturnType<typeof useCaseRecord> & { c: CaseRecord };
type Ctx = CaseCtx;

/** Loads the case from the route and renders loading/not-found states consistently. */
export function CaseFrame({
  title,
  backHref,
  variant = "task",
  aside,
  children,
}: {
  title: string;
  backHref?: (id: string) => string;
  variant?: "task" | "top";
  aside?: (ctx: Ctx) => ReactNode;
  children: (ctx: Ctx) => ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const state = useCaseRecord(id);
  const { data, loading, error, reload } = state;

  if (loading && !data) {
    return (
      <AppShell variant={variant} title={title} backHref={backHref?.(id)}>
        <div className="py-10">
          <Spinner label={t("app.loading")} />
        </div>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell variant={variant} title={title} backHref="/cases">
        {error ? <ErrorNotice error={error} onRetry={reload} /> : null}
        <LinkButton href="/cases" variant="secondary" className="mt-4">
          {t("caseDetail.listTitle")}
        </LinkButton>
      </AppShell>
    );
  }
  const ctx = { ...state, c: data };
  return (
    <AppShell variant={variant} title={title} backHref={backHref?.(id)} demo={data.mode === "demo"} aside={aside?.(ctx)}>
      {children(ctx)}
    </AppShell>
  );
}
