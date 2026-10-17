import { NextResponse } from "next/server";
import { newCase } from "@/domain/case";
import { loadCase, loadCases } from "@/server/caseRepo";
import { HttpError, parseJson, rateLimit, route } from "@/server/http";
import { requireUser } from "@/server/supabase";
import { createCaseSchema } from "@/shared/contracts";

export const GET = route(async () => {
  const { sb } = await requireUser();
  return NextResponse.json({ cases: await loadCases(sb) });
});

export const POST = route(async (req) => {
  const { sb, userId } = await requireUser();
  rateLimit(`create-case:${userId}`, 20, 60 * 60_000);
  const input = await parseJson(req, createCaseSchema);
  if (input.periodStart && input.periodEnd && input.periodEnd < input.periodStart) {
    throw new HttpError("validation_failed", "period", { periodEnd: "before start" });
  }
  const draft = newCase({ mode: "private", ...input });
  const { data, error } = await sb
    .from("cases")
    .insert({
      // owner_id defaults to auth.uid() in the database and RLS checks it.
      work_type: input.workType,
      issue_type: input.issueType,
      platform_label: input.platformLabel,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      description: input.description,
      description_source: input.descriptionSource,
    })
    .select("id")
    .single();
  if (error || !data) throw new HttpError("internal", "database error");
  const created = draft.events[0];
  await sb.from("case_events").insert({ case_id: data.id, owner_id: userId, event_type: created.type, actor: created.actor, at: created.at });
  await sb.from("case_facts").insert({ case_id: data.id, owner_id: userId, revision: 1, schema_version: "facts-v1", facts: {} });
  return NextResponse.json({ case: await loadCase(sb, data.id as string) }, { status: 201 });
});
