import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/publicConfig";
import { integrations } from "@/server/config";
import { GUIDANCE_VERSION } from "@/content/guidance";

/** Which integrations are configured — booleans only, never values or diagnostics. */
export function GET() {
  return NextResponse.json(
    { ok: true, auth: authConfigured, ai: integrations.gemini(), speech: integrations.speech(), guidance: GUIDANCE_VERSION },
    { headers: { "cache-control": "no-store" } },
  );
}
