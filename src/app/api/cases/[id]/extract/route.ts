import { NextResponse } from "next/server";
import type { CaseRecord } from "@/domain/case";
import type { FactSet } from "@/domain/facts";
import { providers } from "@/server/ai";
import { extractionToFacts, validateExtraction } from "@/server/ai/extractToFacts";
import { ProviderError } from "@/server/ai/types";
import { evidenceRows, loadCase, persist } from "@/server/caseRepo";
import { serverConfig } from "@/server/config";
import { HttpError, logOp, parseJson, rateLimit, route } from "@/server/http";
import { mergeExtracted } from "@/server/mergeFacts";
import { assertQuota, beginOperation, finishOperation, findCached } from "@/server/operations";
import { requireUser } from "@/server/supabase";
import { checkSchema } from "@/shared/contracts";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/**
 * Reads newly uploaded evidence with one structured AI request.
 * - idempotency key: a repeated tap returns the existing operation
 * - cache: same owner + same evidence hashes + same model/schema reuses the result
 * - revision check: an old extraction cannot overwrite newer edits
 */
export const POST = route(async (req, { params }: Ctx, requestId) => {
  const { sb, userId } = await requireUser();
  rateLimit(`extract:${userId}`, 6, 60_000);
  const { id } = await params;
  const body = await parseJson(req, checkSchema);
  const prev = await loadCase(sb, id);
  if (prev.inputRevision !== body.expectedRevision) throw new HttpError("revision_conflict");

  const pending = (await evidenceRows(sb, id)).filter((e) => (e.status === "uploaded" || e.status === "failed") && e.derivative_key && e.sha256);
  if (!pending.length) return NextResponse.json({ case: prev });

  const cacheKey = `extract:${serverConfig.geminiModel()}:schema-v1:${pending.map((e) => e.sha256).sort().join(",")}`;
  const op = await beginOperation(sb, userId, { key: body.idempotencyKey, type: "extract", caseId: id, inputRevision: prev.inputRevision, cacheKey });
  if (!op.fresh) {
    if (op.op.status === "failed") throw new HttpError("ai_unavailable");
    return NextResponse.json({ case: prev });
  }

  const fail = async (code: "ai_unavailable" | "timeout" | "ai_invalid_output" | "not_configured" | "quota_exceeded") => {
    await finishOperation(sb, op.id, "failed", null, code);
    await sb.from("evidence").update({ status: "failed" }).in("id", pending.map((e) => e.id));
    throw new HttpError(code);
  };

  let extracted = await findCached<{ facts: FactSet }>(sb, cacheKey);
  if (!extracted) {
    const extractor = providers.extractor();
    if (!extractor) return fail("not_configured");
    try {
      await assertQuota(sb, "extract", serverConfig.dailyExtractLimit() + 1);
    } catch {
      return fail("quota_exceeded");
    }
    await sb.from("evidence").update({ status: "reading" }).in("id", pending.map((e) => e.id));
    const images = [];
    for (const e of pending) {
      const { data } = await sb.storage.from("evidence").download(e.derivative_key!);
      if (!data) return fail("ai_unavailable");
      images.push({ documentId: e.id, mime: "image/webp" as const, bytes: Buffer.from(await data.arrayBuffer()) });
    }
    const started = Date.now();
    let raw: unknown;
    try {
      raw = await extractor.extract(images, AbortSignal.timeout(serverConfig.aiTimeoutMs()));
    } catch (e) {
      const kind = e instanceof ProviderError ? e.kind : "unavailable";
      logOp("extract_failed", { requestId, kind });
      return fail(kind === "timeout" ? "timeout" : "ai_unavailable");
    }
    let v = validateExtraction(raw);
    if (!v.ok) {
      // One bounded corrective retry for invalid structured output.
      try {
        raw = await extractor.extract(images, AbortSignal.timeout(serverConfig.aiTimeoutMs()));
        v = validateExtraction(raw);
      } catch {
        /* handled below */
      }
      if (!v.ok) return fail("ai_invalid_output");
    }
    extracted = { facts: extractionToFacts(v.value, pending.map((e) => e.id)).facts };
    logOp("extract", { requestId, ms: Date.now() - started, images: images.length, fields: Object.keys(extracted.facts).length });
  }

  const latest = await loadCase(sb, id);
  if (latest.inputRevision !== prev.inputRevision) {
    await finishOperation(sb, op.id, "failed", null, "revision_conflict");
    throw new HttpError("revision_conflict");
  }
  const now = new Date().toISOString();
  const next: CaseRecord = {
    ...latest,
    facts: mergeExtracted(latest.facts, extracted.facts),
    inputRevision: latest.inputRevision + 1,
    updatedAt: now,
    events: [...latest.events, { id: crypto.randomUUID(), type: "records_read", actor: "system", at: now, meta: { live: 1, count: pending.length } }],
  };
  await persist(sb, userId, latest, next);
  await sb.from("evidence").update({ status: "read" }).in("id", pending.map((e) => e.id));
  await finishOperation(sb, op.id, "succeeded", extracted);
  return NextResponse.json({ case: await loadCase(sb, id) });
});
