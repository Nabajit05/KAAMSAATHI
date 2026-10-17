"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authConfigured, publicConfig } from "./publicConfig";

let client: SupabaseClient | null = null;

/** Browser client using cookie-based sessions (the server reads the same cookies). */
export function supabaseBrowser(): SupabaseClient | null {
  if (!authConfigured) return null;
  client ??= createBrowserClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey);
  return client;
}

/**
 * Used only to request an email sign-in link. With the implicit flow the link
 * carries the session itself, so it works even if opened in a different
 * browser than the one that asked (PKCE would require the same browser).
 */
export function emailLinkClient(): SupabaseClient {
  return createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
