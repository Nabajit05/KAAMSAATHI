import { NextResponse } from "next/server";
import { loadCase } from "@/server/caseRepo";
import { logOp, route } from "@/server/http";
import { requireUser } from "@/server/supabase";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const { sb } = await requireUser();
  const { id } = await params;
  return NextResponse.json({ case: await loadCase(sb, id) });
});

/**
 * Deletes stored files first, then the case row (which cascades to facts,
 * checks, drafts, evidence rows and events). If file removal fails, the case
 * is marked delete_failed and we report "pending" rather than "deleted".
 */
export const DELETE = route(async (_req, { params }: Ctx, requestId) => {
  const { sb, userId } = await requireUser();
  const { id } = await params;
  await loadCase(sb, id); // ownership check: not found for other users
  await sb.from("cases").update({ deletion_state: "deleting" }).eq("id", id);

  const prefix = `${userId}/${id}`;
  const { data: objects, error: listError } = await sb.storage.from("evidence").list(prefix, { limit: 100 });
  let storageOk = !listError;
  if (storageOk && objects?.length) {
    const { error } = await sb.storage.from("evidence").remove(objects.map((o) => `${prefix}/${o.name}`));
    storageOk = !error;
  }
  if (!storageOk) {
    await sb.from("cases").update({ deletion_state: "delete_failed" }).eq("id", id);
    logOp("case_delete_partial", { requestId });
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }
  const { error } = await sb.from("cases").delete().eq("id", id);
  if (error) {
    await sb.from("cases").update({ deletion_state: "delete_failed" }).eq("id", id);
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }
  return NextResponse.json({ status: "deleted" });
});
