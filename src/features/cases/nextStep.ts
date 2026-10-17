import { canRunCheck, isCheckStale, type CaseRecord } from "@/domain/case";

/** The single most useful next action for a case, used on Home and the case list. */
export function nextStepFor(c: CaseRecord): { href: string; labelKey: string } {
  const base = `/cases/${c.id}`;
  if (c.evidence.length === 0 && Object.keys(c.facts).length === 0) return { href: `${base}/evidence`, labelKey: "evidence.title" };
  if (!c.check || isCheckStale(c)) {
    return canRunCheck(c).ok ? { href: `${base}/review`, labelKey: "review.runCheck" } : { href: `${base}/review`, labelKey: "review.title" };
  }
  if (c.check.outcome === "more_info_needed") return { href: `${base}/evidence`, labelKey: "review.addMissing" };
  if (!c.complaint) return { href: `${base}/result`, labelKey: "result.title" };
  if (c.workflowStatus === "complaint_ready") return { href: base, labelKey: "caseDetail.iSubmitted" };
  return { href: base, labelKey: "caseDetail.continue" };
}
