import { NextResponse, type NextRequest } from "next/server";
import { GUIDANCE, GUIDANCE_VERSION } from "@/content/guidance";

const SECTIONS = new Set(["payment", "safety", "welfare"]);

/** Public, cacheable guidance from the curated allowlist only. */
export function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get("section");
  const items = section && SECTIONS.has(section) ? GUIDANCE.filter((g) => g.section === section) : GUIDANCE;
  return NextResponse.json({ version: GUIDANCE_VERSION, items }, { headers: { "cache-control": "public, max-age=3600" } });
}
