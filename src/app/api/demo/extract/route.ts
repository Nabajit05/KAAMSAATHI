import { NextResponse } from "next/server";
import { FIXTURES } from "@/fixtures/demo";
import { SAMPLE_IMAGES } from "@/fixtures/sampleImages";
import { providers } from "@/server/ai";
import { extractionToFacts, validateExtraction } from "@/server/ai/extractToFacts";
import { ProviderError } from "@/server/ai/types";
import { serverConfig } from "@/server/config";
import { clientIp, HttpError, logOp, parseJson, rateLimit, route } from "@/server/http";
import { demoExtractSchema, type ExtractResponse } from "@/shared/contracts";

/**
 * Live extraction of the fictional sample images, so the demo exercises the
 * real GenAI path. Only fixture ids are accepted; images come from disk.
 */
const recent = new Map<string, { at: number; res: ExtractResponse }>();

export const POST = route(async (req, _ctx: unknown, requestId) => {
  rateLimit(`demo-extract:${clientIp(req)}`, 4, 60_000);
  const { fixtureId } = await parseJson(req, demoExtractSchema);
  const extractor = providers.extractor();
  if (!extractor) throw new HttpError("not_configured");

  // Coalesce repeated taps for the same public sample within a short window.
  const hit = recent.get(fixtureId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return NextResponse.json(hit.res);

  const docIds = FIXTURES[fixtureId].docIds;
  const images = await Promise.all(
    docIds.map(async (id) => ({
      documentId: id,
      mime: "image/png" as const,
      bytes: Buffer.from(SAMPLE_IMAGES[id], "base64"),
    })),
  );

  const started = Date.now();
  let raw: unknown;
  try {
    raw = await extractor.extract(images, AbortSignal.timeout(serverConfig.aiTimeoutMs()));
  } catch (e) {
    const kind = e instanceof ProviderError ? e.kind : "unavailable";
    logOp("demo_extract_failed", { requestId, kind });
    throw new HttpError(kind === "timeout" ? "timeout" : kind === "not_configured" ? "not_configured" : "ai_unavailable");
  }
  const v = validateExtraction(raw);
  if (!v.ok) {
    logOp("demo_extract_invalid", { requestId });
    throw new HttpError("ai_invalid_output");
  }
  const { facts, unreadable, missing } = extractionToFacts(v.value, docIds);
  const res: ExtractResponse = { facts, live: true, unreadable, missing };
  recent.set(fixtureId, { at: Date.now(), res });
  logOp("demo_extract", { requestId, ms: Date.now() - started, fields: Object.keys(facts).length });
  return NextResponse.json(res);
});
