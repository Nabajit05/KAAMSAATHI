"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/app/providers";
import { Button } from "@/components/ui";
import type { CaseRecord } from "@/domain/case";
import { sampleDocUrl } from "@/fixtures/demo";
import { api } from "@/features/cases/client";

/**
 * Modal record viewer using the native <dialog>: focus moves in, Escape
 * closes, and focus returns to the button that opened it.
 */
export function useEvidenceViewer(c: CaseRecord | null) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [doc, setDoc] = useState<{ id: string; url: string | null; name: string; error?: boolean } | null>(null);

  const open = useCallback(
    async (docId: string, from: HTMLElement) => {
      if (!c) return;
      trigger.current = from;
      const ev = c.evidence.find((e) => e.id === docId);
      const name = ev?.filename ?? docId;
      setDoc({ id: docId, url: null, name });
      ref.current?.showModal();
      if (c.mode === "demo") {
        setDoc({ id: docId, url: sampleDocUrl(docId), name });
        return;
      }
      try {
        // Short-lived signed URL, issued only after an ownership check on the server.
        const r = await api<{ url: string }>(`/api/cases/${c.id}/evidence/${docId}`);
        setDoc({ id: docId, url: r.url, name });
      } catch {
        setDoc({ id: docId, url: null, name, error: true });
      }
    },
    [c],
  );

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => {
      setDoc(null);
      trigger.current?.focus();
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  const dialog = (
    <dialog
      ref={ref}
      aria-labelledby="evidence-dialog-title"
      className="m-auto w-[min(640px,calc(100vw-24px))] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-[var(--shadow-float)] backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="evidence-dialog-title" className="min-w-0 truncate font-semibold">
          {doc?.name}
        </h2>
        <form method="dialog">
          <Button type="submit" variant="ghost" size="sm" icon="x">
            {t("app.close")}
          </Button>
        </form>
      </div>
      <div className="max-h-[75dvh] overflow-auto p-4">
        {doc?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, private, per-request URL
          <img src={doc.url} alt={doc.name} className="mx-auto h-auto max-w-full rounded-xl border border-border" />
        ) : doc?.error ? (
          <p>{t("error.generic")}</p>
        ) : (
          <p>{t("app.loading")}</p>
        )}
      </div>
    </dialog>
  );

  return { open, dialog };
}
