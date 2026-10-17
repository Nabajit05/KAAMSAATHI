import { NextResponse } from "next/server";
import { providers } from "@/server/ai";
import { ProviderError } from "@/server/ai/types";
import { serverConfig } from "@/server/config";
import { HttpError, logOp, rateLimit, route } from "@/server/http";
import { assertQuota, beginOperation, finishOperation } from "@/server/operations";
import { requireUser } from "@/server/supabase";

const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // ~30 s of compressed speech
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac"];

/**
 * Speech to text. Audio is forwarded to the provider and never stored by us;
 * only the editable transcript is returned to the worker for confirmation.
 */
export const POST = route(async (req, _ctx: unknown, requestId) => {
  const { sb, userId } = await requireUser();
  rateLimit(`stt:${userId}`, 10, 60_000);
  const transcriber = providers.transcriber();
  if (!transcriber) throw new HttpError("not_configured");

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  const key = form?.get("idempotencyKey");
  if (!(file instanceof Blob) || typeof key !== "string" || !/^[0-9a-f-]{36}$/i.test(key)) throw new HttpError("bad_request");
  const type = file.type.split(";")[0];
  if (!AUDIO_TYPES.includes(type)) throw new HttpError("file_rejected", "audio type");
  if (file.size === 0 || file.size > MAX_AUDIO_BYTES) throw new HttpError("file_rejected", "audio size");

  const op = await beginOperation(sb, userId, { key, type: "transcribe", caseId: null, inputRevision: null });
  if (!op.fresh) {
    const prior = op.op.result as { transcript?: string } | null;
    if (prior?.transcript) return NextResponse.json({ transcript: prior.transcript });
    throw new HttpError("ai_unavailable");
  }
  try {
    await assertQuota(sb, "transcribe", serverConfig.dailySpeechLimit() + 1);
  } catch (e) {
    await finishOperation(sb, op.id, "failed", null, "quota");
    throw e;
  }
  try {
    const r = await transcriber.transcribe(file, AbortSignal.timeout(serverConfig.aiTimeoutMs()));
    // Store only that it succeeded and the short transcript (needed for idempotent replies).
    await finishOperation(sb, op.id, "succeeded", { transcript: r.transcript });
    return NextResponse.json({ transcript: r.transcript, languageCode: r.languageCode });
  } catch (e) {
    const kind = e instanceof ProviderError ? e.kind : "unavailable";
    await finishOperation(sb, op.id, "failed", null, kind);
    logOp("transcribe_failed", { requestId, kind });
    throw new HttpError(kind === "timeout" ? "timeout" : "ai_unavailable");
  }
});
