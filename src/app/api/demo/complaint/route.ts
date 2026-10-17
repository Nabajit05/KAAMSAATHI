import { NextResponse } from "next/server";
import { canRunCheck, withCheck, type CaseRecord } from "@/domain/case";
import type { FactSet } from "@/domain/facts";
import { fixtureCase } from "@/fixtures/demo";
import { draftComplaint } from "@/server/ai/draft";
import { providers } from "@/server/ai";
import { serverConfig } from "@/server/config";
import { clientIp, HttpError, logOp, parseJson, rateLimit, route } from "@/server/http";
import { demoDraftSchema, type DraftResponse } from "@/shared/contracts";

/**
 * Demo-only drafting. The server rebuilds the case from the fictional
 * fixture and accepts only structured fact edits — no free text — so this
 * unauthenticated route cannot be used to send arbitrary content to the AI.
 */
const recent = new Map<string, { at: number; res: DraftResponse }>();
let dayKey = "";
let dayCount = 0;

export const POST = route(async (req, _ctx: unknown, requestId) => {
  rateLimit(`demo-draft:${clientIp(req)}`, 6, 60_000);
  const body = await parseJson(req, demoDraftSchema);

  const cached = recent.get(body.idempotencyKey);
  if (cached && Date.now() - cached.at < 10 * 60_000) return NextResponse.json(cached.res);

  const base = fixtureCase(body.fixtureId, body.locale);
  const c: CaseRecord = { ...base, facts: body.facts as FactSet };
  if (!canRunCheck(c).ok) throw new HttpError("validation_failed", "facts need review");
  const checked = withCheck(c);

  const today = new Date().toISOString().slice(0, 10);
  if (dayKey !== today) {
    dayKey = today;
    dayCount = 0;
  }
  const allowAi = dayCount < serverConfig.demoDailyLimit();
  if (allowAi) dayCount += 1;

  const res = await draftComplaint(checked, body.locale, allowAi ? providers.drafter() : null, serverConfig.aiTimeoutMs());
  recent.set(body.idempotencyKey, { at: Date.now(), res });
  if (recent.size > 500) recent.delete(recent.keys().next().value!);
  logOp("demo_draft", { requestId, source: res.source, note: res.note });
  return NextResponse.json(res);
});
