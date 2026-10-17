import { NextResponse } from "next/server";
import { loadCase } from "@/server/caseRepo";
import { HttpError, parseJson, rateLimit, route } from "@/server/http";
import { requireUser } from "@/server/supabase";
import { evidenceInitSchema } from "@/shared/contracts";

type Ctx = { params: Promise<{ id: string }> };

const MAX_FILES = 5;

/** Step 1 of upload: reserve a random private path and issue a one-time signed upload URL. */
export const POST = route(async (req, { params }: Ctx) => {
  const { sb, userId } = await requireUser();
  rateLimit(`upload:${userId}`, 30, 60 * 60_000);
  const { id } = await params;
  const body = await parseJson(req, evidenceInitSchema);
  const c = await loadCase(sb, id);
  if (c.evidence.length >= MAX_FILES) throw new HttpError("file_rejected", "too many files");

  const objectName = crypto.randomUUID();
  const storageKey = `${userId}/${c.id}/${objectName}`;
  const { data: ev, error } = await sb
    .from("evidence")
    .insert({
      case_id: c.id,
      owner_id: userId,
      storage_key: storageKey,
      submitted_filename: body.filename.replace(/[^\p{L}\p{N}._ -]/gu, "_"),
      declared_mime: body.mime,
      worker_redacted: body.workerRedacted,
      status: "uploading",
    })
    .select("id")
    .single();
  if (error || !ev) throw new HttpError("internal", "database error");

  const { data: signed, error: signError } = await sb.storage.from("evidence").createSignedUploadUrl(storageKey);
  if (signError || !signed) {
    await sb.from("evidence").delete().eq("id", ev.id);
    throw new HttpError("internal", "storage error");
  }
  return NextResponse.json({ evidenceId: ev.id, path: storageKey, token: signed.token });
});
