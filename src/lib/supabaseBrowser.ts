"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { authConfigured, publicConfig } from "./publicConfig";

let client: Promise<SupabaseClient> | null = null;

/**
 * Browser client using cookie-based sessions (the server reads the same cookies).
 * Loaded on demand so pages that never touch auth don't ship the Supabase SDK up front.
 */
export function supabaseBrowser(): Promise<SupabaseClient> | null {
  if (!authConfigured) return null;
  client ??= import("@supabase/ssr").then(({ createBrowserClient }) =>
    createBrowserClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey),
  );
  return client;
}

/**
 * Used only to request an email sign-in link. With the implicit flow the link
 * carries the session itself, so it works even if opened in a different
 * browser than the one that asked (PKCE would require the same browser).
 */
export async function emailLinkClient(): Promise<SupabaseClient> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
