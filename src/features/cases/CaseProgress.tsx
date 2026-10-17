"use client";

import { useT } from "@/app/providers";
import { canRunCheck, isCheckStale, type CaseRecord } from "@/domain/case";
import { StageBar } from "@/components/ui";

/** Real stages only: records → confirm → check → complaint. */
export function caseStage(c: CaseRecord): number {
  if (c.complaint) return 4;
  if (c.check && !isCheckStale(c)) return 3;
  if (canRunCheck(c).ok && Object.keys(c.facts).length) return 2;
  if (c.evidence.length || Object.keys(c.facts).length) return 1;
  return 0;
}

export function CaseProgress({ c }: { c: CaseRecord }) {
  const { t } = useT();
  const stages = [t("evidence.title"), t("review.title"), t("result.title"), t("complaint.title")];
  return <StageBar stages={stages} current={caseStage(c)} label={t("caseDetail.workflow")} />;
}
