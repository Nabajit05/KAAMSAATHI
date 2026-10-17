import { NextResponse } from "next/server";
import { isCheckStale, withComplaint, withComplaintApproved, withComplaintText } from "@/domain/case";
import { providers } from "@/server/ai";
import { draftComplaint } from "@/server/ai/draft";
import { loadCase, persist } from "@/server/caseRepo";
import { serverConfig } from "@/server/config";
import { HttpError, logOp, parseJson, route } from "@/server/http";
import { assertQuota, beginOperation, finishOperation } from "@/server/operations";
import { requireUser } from "@/server/supabase";
import { complaintPatchSchema, draftSchema, type DraftResponse } from "@/shared/contracts";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req, { params }: Ctx, requestId) => {
  const { sb, userId } = await requireUser();
  const { id } = await params;
  const body = await parseJson(req, draftSchema);
  const prev = await loadCase(sb, id);
  if (prev.inputRevision !== body.expectedRevision) throw new HttpError("revision_conflict");
  if (!prev.check || isCheckStale(prev)) throw new HttpError("validation_failed", "check required");

  const op = await beginOperation(sb, userId, { key: body.idempotencyKey, type: "draft", caseId: id, inputRevision: prev.inputRevision });
  if (!op.fresh) {
    const note = (op.op.result as { note?: DraftResponse["note"] } | null)?.note ?? null;
    return NextResponse.json({ case: prev, note });
  }
  let drafter = providers.drafter();
  try {
    await assertQuota(sb, "draft", serverConfig.dailyDraftLimit());
  } catch {
    drafter = null; // over quota: still give the deterministic draft
  }
  const res = await draftComplaint(prev, body.locale, drafter, serverConfig.aiTimeoutMs());
  const next = withComplaint(prev, { locale: body.locale, text: res.text, source: res.source });
  await persist(sb, userId, prev, next);
  await finishOperation(sb, op.id, "succeeded", { source: res.source, note: res.note });
  logOp("draft", { requestId, source: res.source, note: res.note });
  return NextResponse.json({ case: await loadCase(sb, id), note: res.note });
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const { sb, userId } = await requireUser();
  const { id } = await params;
  const body = await parseJson(req, complaintPatchSchema);
  const prev = await loadCase(sb, id);
  if (!prev.complaint) throw new HttpError("not_found");
  if (prev.complaint.revision !== body.expectedDraftRevision) throw new HttpError("revision_conflict");
  let next = prev;
  if (body.action === "edit") next = withComplaintText(prev, body.text);
  else {
    try {
      next = withComplaintApproved(prev);
    } catch {
      throw new HttpError("validation_failed", "complaint is stale");
    }
  }
  if (next !== prev) await persist(sb, userId, prev, next);
  return NextResponse.json({ case: await loadCase(sb, id) });
});
