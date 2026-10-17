import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseEvent, CaseRecord, ComplaintDraft, EvidenceItem } from "@/domain/case";
import type { FactSet } from "@/domain/facts";
import type { CheckResult } from "@/domain/result";
import { HttpError } from "./http";

/**
 * Assembles and persists the case aggregate using the user-scoped client,
 * so RLS limits every read and write to the signed-in owner.
 */

export const FACTS_SCHEMA_VERSION = "facts-v1";

interface CaseRow {
  id: string;
  owner_id: string;
  work_type: CaseRecord["workType"];
  issue_type: CaseRecord["issueType"];
  platform_label: string | null;
  period_start: string | null;
  period_end: string | null;
  timezone: string;
  description: string;
  description_source: CaseRecord["descriptionSource"];
  workflow_status: CaseRecord["workflowStatus"];
  current_input_revision: number;
  follow_up_date: string | null;
  submission: CaseRecord["submission"];
  worker_outcome: CaseRecord["outcome"];
  deletion_state: string;
  created_at: string;
  updated_at: string;
}

interface EvidenceRow {
  id: string;
  case_id: string;
  storage_key: string;
  derivative_key: string | null;
  submitted_filename: string;
  declared_mime: string;
  verified_mime: string | null;
  byte_size: number | null;
  sha256: string | null;
  status: EvidenceItem["status"];
  worker_redacted: boolean;
  metadata_note: string | null;
  created_at: string;
}

function toEvidence(r: EvidenceRow): EvidenceItem {
  return {
    id: r.id,
    kind: "upload",
    filename: r.submitted_filename,
    mime: r.verified_mime ?? r.declared_mime,
    byteSize: r.byte_size,
    sha256: r.sha256,
    status: r.status,
    workerRedacted: r.worker_redacted,
    metadataNote: r.metadata_note,
    createdAt: r.created_at,
  };
}

async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new HttpError("internal", "database error");
  return data as T;
}

export async function loadCases(sb: SupabaseClient, ids?: string[]): Promise<CaseRecord[]> {
  let query = sb.from("cases").select("*").neq("deletion_state", "deleting").order("updated_at", { ascending: false }).limit(100);
  if (ids) query = query.in("id", ids);
  const rows = await q<CaseRow[]>(query);
  if (!rows.length) return [];
  const caseIds = rows.map((r) => r.id);

  const [facts, checks, drafts, evidence, events] = await Promise.all([
    q<Array<{ case_id: string; revision: number; facts: FactSet }>>(
      sb.from("case_facts").select("case_id, revision, facts").in("case_id", caseIds).order("revision", { ascending: false }),
    ),
    q<Array<{ case_id: string; result: CheckResult; created_at: string }>>(
      sb.from("check_runs").select("case_id, result, created_at").in("case_id", caseIds).order("created_at", { ascending: false }),
    ),
    q<Array<Record<string, unknown>>>(sb.from("complaint_drafts").select("*").in("case_id", caseIds)),
    q<EvidenceRow[]>(sb.from("evidence").select("*").in("case_id", caseIds).order("created_at")),
    q<Array<{ id: string; case_id: string; event_type: CaseEvent["type"]; actor: CaseEvent["actor"]; meta: CaseEvent["meta"]; at: string }>>(
      sb.from("case_events").select("id, case_id, event_type, actor, meta, at").in("case_id", caseIds).order("at"),
    ),
  ]);

  return rows.map((r) => {
    const latestFacts = facts.find((f) => f.case_id === r.id);
    const latestCheck = checks.find((c) => c.case_id === r.id);
    const d = drafts.find((x) => x.case_id === r.id);
    const complaint: ComplaintDraft | null = d
      ? {
          id: d.id as string,
          checkInputRevision: d.check_input_revision as number,
          locale: d.locale as ComplaintDraft["locale"],
          text: d.body as string,
          source: d.source as ComplaintDraft["source"],
          revision: d.revision as number,
          approvedAt: (d.approved_at as string | null) ?? null,
          approvedRevision: (d.approved_revision as number | null) ?? null,
          exportedAt: (d.exported_at as string | null) ?? null,
        }
      : null;
    return {
      id: r.id,
      mode: "private",
      fixtureId: null,
      workType: r.work_type,
      issueType: r.issue_type,
      platformLabel: r.platform_label,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      timezone: r.timezone,
      description: r.description,
      descriptionSource: r.description_source,
      workflowStatus: r.workflow_status,
      inputRevision: r.current_input_revision,
      facts: latestFacts?.facts ?? {},
      evidence: evidence.filter((e) => e.case_id === r.id && e.status !== "deleting").map(toEvidence),
      check: latestCheck?.result ?? null,
      complaint,
      events: events
        .filter((e) => e.case_id === r.id)
        .map((e) => ({ id: e.id, type: e.event_type, actor: e.actor, at: e.at, meta: e.meta ?? undefined })),
      submission: r.submission,
      outcome: r.worker_outcome,
      followUpDate: r.follow_up_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    } satisfies CaseRecord;
  });
}

export async function loadCase(sb: SupabaseClient, id: string): Promise<CaseRecord> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError("not_found");
  const [c] = await loadCases(sb, [id]);
  // Not found and not yours look identical: RLS returns no row in both cases.
  if (!c) throw new HttpError("not_found");
  return c;
}

export async function evidenceRows(sb: SupabaseClient, caseId: string): Promise<EvidenceRow[]> {
  return q<EvidenceRow[]>(sb.from("evidence").select("*").eq("case_id", caseId));
}

/**
 * Writes the difference between two versions of a case. The case row update
 * is conditioned on the previous input revision, so a stale tab or second
 * device cannot silently overwrite newer edits.
 */
export async function persist(sb: SupabaseClient, userId: string, prev: CaseRecord, next: CaseRecord): Promise<void> {
  const { data: updated, error } = await sb
    .from("cases")
    .update({
      workflow_status: next.workflowStatus,
      current_input_revision: next.inputRevision,
      follow_up_date: next.followUpDate,
      submission: next.submission,
      worker_outcome: next.outcome,
      updated_at: next.updatedAt,
    })
    .eq("id", prev.id)
    .eq("current_input_revision", prev.inputRevision)
    .select("id");
  if (error) throw new HttpError("internal", "database error");
  if (!updated?.length) throw new HttpError("revision_conflict");

  const writes: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (next.inputRevision !== prev.inputRevision || next.facts !== prev.facts) {
    writes.push(
      sb.from("case_facts").upsert({
        case_id: next.id,
        owner_id: userId,
        revision: next.inputRevision,
        schema_version: FACTS_SCHEMA_VERSION,
        facts: next.facts,
      }),
    );
  }
  if (next.check && next.check !== prev.check) {
    writes.push(
      sb.from("check_runs").insert({
        case_id: next.id,
        owner_id: userId,
        input_revision: next.check.inputRevision,
        rule_version: next.check.ruleVersion,
        outcome: next.check.outcome,
        result: next.check,
      }),
    );
  }
  if (next.complaint && next.complaint !== prev.complaint) {
    const d = next.complaint;
    writes.push(
      sb.from("complaint_drafts").upsert(
        {
          id: d.id,
          case_id: next.id,
          owner_id: userId,
          check_input_revision: d.checkInputRevision,
          locale: d.locale,
          body: d.text,
          source: d.source,
          revision: d.revision,
          approved_at: d.approvedAt,
          approved_revision: d.approvedRevision,
          exported_at: d.exportedAt,
          updated_at: next.updatedAt,
        },
        { onConflict: "case_id" },
      ),
    );
  }
  const known = new Set(prev.events.map((e) => e.id));
  const newEvents = next.events.filter((e) => !known.has(e.id));
  if (newEvents.length) {
    writes.push(
      sb.from("case_events").insert(
        newEvents.map((e) => ({ id: e.id, case_id: next.id, owner_id: userId, event_type: e.type, actor: e.actor, meta: e.meta ?? null, at: e.at })),
      ),
    );
  }
  const results = await Promise.all(writes);
  if (results.some((r) => r.error)) throw new HttpError("internal", "database error");
}
