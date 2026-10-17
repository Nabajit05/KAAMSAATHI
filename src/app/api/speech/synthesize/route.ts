import { z } from "zod";
import { providers } from "@/server/ai";
import { ProviderError } from "@/server/ai/types";
import { serverConfig } from "@/server/config";
import { HttpError, parseJson, rateLimit, route } from "@/server/http";
import { assertQuota, beginOperation, finishOperation } from "@/server/operations";
import { requireUser } from "@/server/supabase";

const schema = z.object({ text: z.string().trim().min(1).max(1500), locale: z.enum(["en", "hi"]) });

/** On-demand text to speech for signed-in workers; audio is streamed back, not stored. */
export const POST = route(async (req) => {
  const { sb, userId } = await requireUser();
  rateLimit(`tts:${userId}`, 10, 60_000);
  const synth = providers.synthesizer();
  if (!synth) throw new HttpError("not_configured");
  const body = await parseJson(req, schema);
  const op = await beginOperation(sb, userId, { key: crypto.randomUUID(), type: "synthesize", caseId: null, inputRevision: null });
  if (!op.fresh) throw new HttpError("internal");
  try {
    await assertQuota(sb, "synthesize", serverConfig.dailySpeechLimit() + 1);
    const audio = await synth.synthesize(body.text, body.locale, AbortSignal.timeout(serverConfig.aiTimeoutMs()));
    await finishOperation(sb, op.id, "succeeded", null);
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/wav", "cache-control": "no-store" } });
  } catch (e) {
    await finishOperation(sb, op.id, "failed", null, e instanceof ProviderError ? e.kind : "error");
    if (e instanceof HttpError) throw e;
    throw new HttpError(e instanceof ProviderError && e.kind === "timeout" ? "timeout" : "ai_unavailable");
  }
});
