import { NextResponse } from "next/server";
import { loadCase, evidenceRows } from "@/server/caseRepo";
import { HttpError, logOp, route } from "@/server/http";
import { ImageRejected, verifyImage } from "@/server/imageCheck";
import { requireUser } from "@/server/supabase";

type Ctx = { params: Promise<{ id: string; evidenceId: string }> };

async function findEvidence(sb: Awaited<ReturnType<typeof requireUser>>["sb"], caseId: string, evidenceId: string) {
  await loadCase(sb, caseId); // ownership
  const rows = await evidenceRows(sb, caseId);
  const ev = rows.find((r) => r.id === evidenceId);
  if (!ev) throw new HttpError("not_found");
  return { ev, rows };
}

/** Short-lived signed URL to view the submitted original, after an ownership check. */
export const GET = route(async (_req, { params }: Ctx) => {
  const { sb } = await requireUser();
  const { id, evidenceId } = await params;
  const { ev } = await findEvidence(sb, id, evidenceId);
  if (ev.status === "uploading" || ev.status === "deleting") throw new HttpError("not_found");
  const { data, error } = await sb.storage.from("evidence").createSignedUrl(ev.storage_key, 120);
  if (error || !data) throw new HttpError("internal", "storage error");
  return NextResponse.json({ url: data.signedUrl });
});

/**
 * Step 2 of upload. The client's "done" is not trusted: we download the
 * stored object, check its bytes, type, size and dimensions, hash it, and
 * write a metadata-free derivative for AI reading.
 */
export const POST = route(async (_req, { params }: Ctx, requestId) => {
  const { sb, userId } = await requireUser();
  const { id, evidenceId } = await params;
  const { ev, rows } = await findEvidence(sb, id, evidenceId);
  if (ev.status !== "uploading") return NextResponse.json({ ok: true });

  const { data: blob, error } = await sb.storage.from("evidence").download(ev.storage_key);
  if (error || !blob) throw new HttpError("not_found", "upload missing");
  const buf = Buffer.from(await blob.arrayBuffer());

  const reject = async (reason: string) => {
    await sb.storage.from("evidence").remove([ev.storage_key]);
    await sb.from("evidence").delete().eq("id", ev.id);
    logOp("evidence_rejected", { requestId, reason });
    throw new HttpError("file_rejected", reason);
  };

  let verified;
  try {
    verified = await verifyImage(buf, ev.declared_mime);
  } catch (e) {
    if (e instanceof ImageRejected) return reject(e.message);
    throw e;
  }
  if (rows.some((r) => r.id !== ev.id && r.sha256 === verified.sha256)) return reject("duplicate");

  const derivativeKey = `${userId}/${id}/${crypto.randomUUID()}.derived.webp`;
  const up = await sb.storage.from("evidence").upload(derivativeKey, verified.derivative, { contentType: "image/webp", upsert: false });
  if (up.error) throw new HttpError("internal", "storage error");

  const { error: updError } = await sb
    .from("evidence")
    .update({
      status: "uploaded",
      verified_mime: verified.mime,
      byte_size: buf.length,
      sha256: verified.sha256,
      derivative_key: derivativeKey,
      metadata_note: verified.hadLocation ? "Location data removed from the copy used for reading; your original is unchanged." : null,
    })
    .eq("id", ev.id);
  if (updError) throw new HttpError("internal", "database error");
  await sb.from("case_events").insert({ case_id: id, owner_id: userId, event_type: "evidence_added", actor: "worker", meta: { evidence: ev.id } });
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { sb, userId } = await requireUser();
  const { id, evidenceId } = await params;
  const { ev } = await findEvidence(sb, id, evidenceId);
  await sb.from("evidence").update({ status: "deleting" }).eq("id", ev.id);
  const keys = [ev.storage_key, ev.derivative_key].filter((k): k is string => !!k);
  const { error } = await sb.storage.from("evidence").remove(keys);
  if (error) {
    await sb.from("evidence").update({ status: "delete_failed" }).eq("id", ev.id);
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }
  await sb.from("evidence").delete().eq("id", ev.id);
  await sb.from("case_events").insert({ case_id: id, owner_id: userId, event_type: "evidence_removed", actor: "worker" });
  return NextResponse.json({ status: "deleted" });
});
