import { checkDailyWage } from "./dailyWage";
import { pendingReview, type CheckType, type Fact, type FactSet, type FieldKey } from "./facts";
import { checkIncentive } from "./incentive";
import type { Paise } from "./money";
import type { CheckResult } from "./result";
import { checkSettlement } from "./settlement";

export type Locale = "en" | "hi";
export type WorkType = "platform" | "daily_wage";
export type IssueType = "missing_incentive" | "deduction" | "payout_mismatch" | "not_sure" | "wage_due";

/** Workflow status is separate from the calculation outcome. */
export type WorkflowStatus = "draft" | "checked" | "complaint_ready" | "submitted" | "resolved" | "closed";

export type EvidenceStatus = "uploading" | "uploaded" | "reading" | "read" | "failed" | "deleting" | "delete_failed";

export interface EvidenceItem {
  id: string;
  kind: "sample" | "upload" | "manual";
  filename: string;
  mime: string | null;
  byteSize: number | null;
  sha256: string | null;
  status: EvidenceStatus;
  /** Worker cropped/blurred before upload; the redacted version is the submitted evidence. */
  workerRedacted: boolean;
  /** e.g. "GPS location removed from the copy sent for reading" — never treated as proof. */
  metadataNote: string | null;
  createdAt: string;
}

export type CaseEventType =
  | "created"
  | "evidence_added"
  | "evidence_removed"
  | "records_read"
  | "fact_changed"
  | "checked"
  | "complaint_prepared"
  | "complaint_approved"
  | "complaint_exported"
  | "submitted" // worker-reported
  | "outcome_reported" // worker-reported
  | "follow_up_set";

export interface CaseEvent {
  id: string;
  type: CaseEventType;
  at: string;
  actor: "worker" | "system";
  meta?: Record<string, string | number | null>;
}

export interface ComplaintDraft {
  id: string;
  /** The check this draft was written from. A newer input revision makes it stale. */
  checkInputRevision: number;
  locale: Locale;
  text: string;
  source: "ai" | "template" | "recorded_demo";
  revision: number;
  approvedAt: string | null;
  /** Text revision that was approved; any edit after approval clears approval. */
  approvedRevision: number | null;
  exportedAt: string | null;
}

export interface WorkerSubmission {
  submittedOn: string; // YYYY-MM-DD, worker-reported
  channel: string;
  ticketId: string | null;
}

export interface WorkerOutcome {
  kind: "received_full" | "received_part" | "declined" | "no_response";
  amountPaise: Paise | null;
  reportedOn: string;
}

export interface CaseRecord {
  id: string;
  mode: "demo" | "private";
  fixtureId: string | null;
  workType: WorkType;
  issueType: IssueType;
  platformLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  timezone: string;
  description: string;
  descriptionSource: "typed" | "voice" | null;
  workflowStatus: WorkflowStatus;
  inputRevision: number;
  facts: FactSet;
  evidence: EvidenceItem[];
  check: CheckResult | null;
  complaint: ComplaintDraft | null;
  events: CaseEvent[];
  submission: WorkerSubmission | null;
  outcome: WorkerOutcome | null;
  followUpDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MARKET_TIMEZONE = "Asia/Kolkata";

export function checkTypeFor(issue: IssueType): CheckType {
  switch (issue) {
    case "missing_incentive":
      return "incentive";
    case "wage_due":
      return "daily_wage";
    default:
      return "settlement";
  }
}

export function runCheck(c: CaseRecord): CheckResult {
  const type = checkTypeFor(c.issueType);
  if (type === "incentive") return checkIncentive(c.facts, c.inputRevision);
  if (type === "daily_wage") return checkDailyWage(c.facts, c.inputRevision);
  return checkSettlement(c.facts, c.inputRevision);
}

export function canRunCheck(c: CaseRecord): { ok: true } | { ok: false; pending: FieldKey[] } {
  const pending = pendingReview(c.facts, checkTypeFor(c.issueType));
  return pending.length ? { ok: false, pending } : { ok: true };
}

export function isCheckStale(c: CaseRecord): boolean {
  return !!c.check && c.check.inputRevision !== c.inputRevision;
}

export function isComplaintStale(c: CaseRecord): boolean {
  return !!c.complaint && c.complaint.checkInputRevision !== c.inputRevision;
}

export function isComplaintApproved(d: ComplaintDraft | null): boolean {
  return !!d && d.approvedAt !== null && d.approvedRevision === d.revision;
}

function event(type: CaseEventType, actor: CaseEvent["actor"], meta?: CaseEvent["meta"], now = new Date()): CaseEvent {
  return { id: crypto.randomUUID(), type, at: now.toISOString(), actor, meta };
}

/**
 * Changing a consequential fact bumps the input revision. The previous check
 * and complaint stay visible but are marked stale until rechecked, and any
 * complaint approval is withdrawn.
 */
export function withFact(c: CaseRecord, key: FieldKey, fact: Fact, now = new Date()): CaseRecord {
  const prev = c.facts[key];
  const valueChanged = !prev || prev.value !== fact.value || prev.provenance !== fact.provenance;
  const next: CaseRecord = { ...c, facts: { ...c.facts, [key]: fact }, updatedAt: now.toISOString() };
  if (!valueChanged) return next;
  next.inputRevision = c.inputRevision + 1;
  next.events = [...c.events, event("fact_changed", "worker", { field: key }, now)];
  if (next.complaint) next.complaint = { ...next.complaint, approvedAt: null, approvedRevision: null };
  if (c.workflowStatus === "checked" || c.workflowStatus === "complaint_ready") next.workflowStatus = "draft";
  return next;
}

export function withCheck(c: CaseRecord, now = new Date()): CaseRecord {
  const gate = canRunCheck(c);
  if (!gate.ok) throw new Error(`Cannot check: ${gate.pending.join(",")} need review`);
  const result = runCheck(c);
  const advanced = c.workflowStatus === "draft" ? "checked" : c.workflowStatus;
  return {
    ...c,
    check: result,
    workflowStatus: advanced,
    updatedAt: now.toISOString(),
    events: [...c.events, event("checked", "system", { outcome: result.outcome, rule: result.ruleVersion, revision: c.inputRevision }, now)],
  };
}

export function withComplaint(c: CaseRecord, draft: Omit<ComplaintDraft, "id" | "revision" | "approvedAt" | "approvedRevision" | "exportedAt" | "checkInputRevision">, now = new Date()): CaseRecord {
  if (!c.check || isCheckStale(c)) throw new Error("A current check is required before drafting");
  return {
    ...c,
    complaint: {
      ...draft,
      id: crypto.randomUUID(),
      checkInputRevision: c.inputRevision,
      revision: 1,
      approvedAt: null,
      approvedRevision: null,
      exportedAt: null,
    },
    updatedAt: now.toISOString(),
    events: [...c.events, event("complaint_prepared", "system", { source: draft.source, locale: draft.locale }, now)],
  };
}

export function withComplaintText(c: CaseRecord, text: string, now = new Date()): CaseRecord {
  if (!c.complaint || c.complaint.text === text) return c;
  return {
    ...c,
    complaint: { ...c.complaint, text, revision: c.complaint.revision + 1, approvedAt: null, approvedRevision: null },
    updatedAt: now.toISOString(),
  };
}

export function withComplaintApproved(c: CaseRecord, now = new Date()): CaseRecord {
  if (!c.complaint) return c;
  if (isComplaintStale(c)) throw new Error("Complaint is based on an old check");
  return {
    ...c,
    complaint: { ...c.complaint, approvedAt: now.toISOString(), approvedRevision: c.complaint.revision },
    workflowStatus: c.workflowStatus === "checked" || c.workflowStatus === "draft" ? "complaint_ready" : c.workflowStatus,
    updatedAt: now.toISOString(),
    events: [...c.events, event("complaint_approved", "worker", { revision: c.complaint.revision }, now)],
  };
}

export function withExported(c: CaseRecord, how: "copy" | "share" | "print", now = new Date()): CaseRecord {
  if (!c.complaint) return c;
  return {
    ...c,
    complaint: { ...c.complaint, exportedAt: now.toISOString() },
    updatedAt: now.toISOString(),
    events: [...c.events, event("complaint_exported", "worker", { how }, now)],
  };
}

/** Only the worker can say a complaint was submitted or an outcome happened. */
export function withSubmission(c: CaseRecord, s: WorkerSubmission, now = new Date()): CaseRecord {
  return {
    ...c,
    submission: s,
    workflowStatus: "submitted",
    updatedAt: now.toISOString(),
    events: [...c.events, event("submitted", "worker", { on: s.submittedOn, ticket: s.ticketId }, now)],
  };
}

export function withOutcome(c: CaseRecord, o: WorkerOutcome, now = new Date()): CaseRecord {
  const resolved = o.kind === "received_full";
  return {
    ...c,
    outcome: o,
    workflowStatus: resolved ? "resolved" : c.workflowStatus,
    updatedAt: now.toISOString(),
    events: [...c.events, event("outcome_reported", "worker", { kind: o.kind, amount: o.amountPaise }, now)],
  };
}

export function withFollowUp(c: CaseRecord, date: string | null, now = new Date()): CaseRecord {
  return {
    ...c,
    followUpDate: date,
    updatedAt: now.toISOString(),
    events: [...c.events, event("follow_up_set", "worker", { date }, now)],
  };
}

export function newCase(
  init: Pick<CaseRecord, "mode" | "workType" | "issueType"> & Partial<CaseRecord>,
  now = new Date(),
): CaseRecord {
  const iso = now.toISOString();
  return {
    id: crypto.randomUUID(),
    fixtureId: null,
    platformLabel: null,
    periodStart: null,
    periodEnd: null,
    timezone: MARKET_TIMEZONE,
    description: "",
    descriptionSource: null,
    workflowStatus: "draft",
    inputRevision: 1,
    facts: {},
    evidence: [],
    check: null,
    complaint: null,
    events: [event("created", "worker", undefined, now)],
    submission: null,
    outcome: null,
    followUpDate: null,
    createdAt: iso,
    updatedAt: iso,
    ...init,
  };
}

/** Calendar date (YYYY-MM-DD) of an instant in a given timezone, for period boundaries. */
export function dateInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
