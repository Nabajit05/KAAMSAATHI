import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { authConfigured, publicConfig } from "@/lib/publicConfig";
import { serverConfig } from "./config";
import { HttpError } from "./http";

/**
 * User-scoped client: requests carry the worker's session, so Postgres RLS
 * applies to every query. Session cookies are managed by @supabase/ssr.
 */
export async function userClient(): Promise<SupabaseClient> {
  if (!authConfigured) throw new HttpError("not_configured");
  const store = await cookies();
  return createServerClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* called from a context where cookies are read-only */
        }
      },
    },
  });
}

/**
 * Verifies the session with Supabase Auth (not just decoding the cookie) and
 * returns the owner id. owner_id is never taken from a request body.
 */
export async function requireUser(): Promise<{ sb: SupabaseClient; userId: string }> {
  const sb = await userClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new HttpError("unauthorized");
  return { sb, userId: data.user.id };
}

/**
 * Service-role client: bypasses RLS. Only used for account deletion, which
 * must remove the auth user. Callers must enforce ownership explicitly.
 */
export function adminClient(): SupabaseClient | null {
  const key = serverConfig.supabaseServiceRoleKey();
  if (!authConfigured || !key) return null;
  return createClient(publicConfig.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
