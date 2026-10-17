"use client";

import { useT } from "@/app/providers";
import { Card } from "@/components/ui";
import type { CaseRecord } from "@/domain/case";
import { sampleDocUrl } from "@/fixtures/demo";

/**
 * Desktop-only evidence column so the worker can compare records with facts
 * side by side. Hidden on small screens, where "See record" opens a dialog.
 */
export function EvidenceAside({ c }: { c: CaseRecord }) {
  const { t } = useT();
  const samples = c.evidence.filter((e) => e.kind === "sample");
  if (samples.length === 0) return null;
  return (
    <div className="hidden lg:block">
      <Card className="sticky top-4">
        <h2 className="font-semibold">{t("evidence.sampleLabel")}</h2>
        <ul className="mt-3 space-y-3">
          {samples.map((e) => (
            <li key={e.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small static sample */}
              <img src={sampleDocUrl(e.id) ?? ""} alt={e.filename} className="w-full rounded-xl border border-border" />
              <p className="mt-1 text-sm text-muted">{e.filename}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
