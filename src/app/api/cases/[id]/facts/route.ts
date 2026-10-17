import { NextResponse } from "next/server";
import { withFact } from "@/domain/case";
import { loadCase, persist } from "@/server/caseRepo";
import { HttpError, parseJson, route } from "@/server/http";
import { requireUser } from "@/server/supabase";
import { editFactSchema, valueFitsField } from "@/shared/contracts";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req, { params }: Ctx) => {
  const { sb, userId } = await requireUser();
  const { id } = await params;
  const body = await parseJson(req, editFactSchema);
  if (!valueFitsField(body.key, body.fact.value)) throw new HttpError("validation_failed", "value", { value: "invalid for field" });
  const prev = await loadCase(sb, id);
  if (prev.inputRevision !== body.expectedRevision) throw new HttpError("revision_conflict");
  // Workers can only review or enter values; they cannot relabel a typed value as a record.
  const before = prev.facts[body.key];
  const fact = { ...body.fact };
  if (fact.provenance === "record" && (!before || before.provenance !== "record" || before.value !== fact.value)) {
    if (!(before?.alternative && before.alternative.provenance === "record" && before.alternative.value === fact.value)) {
      fact.provenance = "worker_entered";
    }
  }
  const next = withFact(prev, body.key, fact);
  await persist(sb, userId, prev, next);
  return NextResponse.json({ case: await loadCase(sb, id) });
});
