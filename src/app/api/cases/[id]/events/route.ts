import { NextResponse } from "next/server";
import { withExported, withFollowUp, withOutcome, withSubmission } from "@/domain/case";
import { loadCase, persist } from "@/server/caseRepo";
import { HttpError, parseJson, route } from "@/server/http";
import { requireUser } from "@/server/supabase";
import { workerEventSchema } from "@/shared/contracts";

type Ctx = { params: Promise<{ id: string }> };

/** Only worker-reported events are accepted here; nothing is inferred by a model. */
export const POST = route(async (req, { params }: Ctx) => {
  const { sb, userId } = await requireUser();
  const { id } = await params;
  const body = await parseJson(req, workerEventSchema);
  const prev = await loadCase(sb, id);
  let next = prev;
  switch (body.type) {
    case "exported":
      if (!prev.complaint) throw new HttpError("not_found");
      next = withExported(prev, body.how);
      break;
    case "submitted":
      next = withSubmission(prev, { submittedOn: body.submittedOn, channel: body.channel, ticketId: body.ticketId });
      break;
    case "outcome":
      next = withOutcome(prev, { kind: body.kind, amountPaise: body.amountPaise, reportedOn: new Date().toISOString().slice(0, 10) });
      break;
    case "follow_up":
      next = withFollowUp(prev, body.date);
      break;
  }
  await persist(sb, userId, prev, next);
  return NextResponse.json({ case: await loadCase(sb, id) });
});
