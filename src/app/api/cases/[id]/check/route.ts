import { NextResponse } from "next/server";
import { canRunCheck, withCheck } from "@/domain/case";
import { loadCase, persist } from "@/server/caseRepo";
import { HttpError, parseJson, route } from "@/server/http";
import { beginOperation, finishOperation } from "@/server/operations";
import { requireUser } from "@/server/supabase";
import { checkSchema } from "@/shared/contracts";

type Ctx = { params: Promise<{ id: string }> };

/** Deterministic check: no AI. Recorded with rule version and input revision. */
export const POST = route(async (req, { params }: Ctx) => {
  const { sb, userId } = await requireUser();
  const { id } = await params;
  const body = await parseJson(req, checkSchema);
  const prev = await loadCase(sb, id);
  if (prev.inputRevision !== body.expectedRevision) throw new HttpError("revision_conflict");
  const op = await beginOperation(sb, userId, { key: body.idempotencyKey, type: "check", caseId: id, inputRevision: prev.inputRevision });
  if (!op.fresh) return NextResponse.json({ case: prev });
  if (!canRunCheck(prev).ok) {
    await finishOperation(sb, op.id, "failed", null, "needs_review");
    throw new HttpError("validation_failed", "facts need review");
  }
  const next = withCheck(prev);
  await persist(sb, userId, prev, next);
  await finishOperation(sb, op.id, "succeeded", { outcome: next.check?.outcome });
  return NextResponse.json({ case: await loadCase(sb, id) });
});
