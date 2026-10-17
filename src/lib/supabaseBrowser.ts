"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authConfigured, publicConfig } from "./publicConfig";

let client: SupabaseClient | null = null;

/** Browser client using cookie-based sessions (the server reads the same cookies). */
export function supabaseBrowser(): SupabaseClient | null {
  if (!authConfigured) return null;
  client ??= createBrowserClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey);
  return client;
}
