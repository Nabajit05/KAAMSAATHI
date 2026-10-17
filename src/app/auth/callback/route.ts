import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/phone";
import { userClient } from "@/server/supabase";

/**
 * Email sign-in link landing. Supabase redirects here with a one-time PKCE
 * code, which we exchange for a cookie session on the server.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (code) {
    const sb = await userClient();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await sb.from("profiles").upsert({ user_id: data.user.id, consent_version: "2026-10-17", consented_at: new Date().toISOString() });
      return NextResponse.redirect(new URL(next, req.nextUrl.origin));
    }
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", req.nextUrl.origin));
}
