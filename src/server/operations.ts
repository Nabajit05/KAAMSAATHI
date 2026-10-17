import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http";

export type OperationType = "extract" | "check" | "draft" | "transcribe" | "synthesize";

interface OperationRow {
  id: string;
  status: "running" | "succeeded" | "failed";
  result: unknown;
  error_code: string | null;
  created_at: string;
}

/**
 * Starts an operation keyed by the client's idempotency key. A repeated tap
 * with the same key returns the existing operation instead of starting
 * another (billed) provider call. The unique (owner_id, idempotency_key)
 * constraint makes this safe under concurrency.
 */
export async function beginOperation(
  sb: SupabaseClient,
  userId: string,
  input: { key: string; type: OperationType; caseId: string | null; inputRevision: number | null; cacheKey?: string | null },
): Promise<{ fresh: true; id: string } | { fresh: false; op: OperationRow }> {
  const { data, error } = await sb
    .from("operations")
    .insert({
      owner_id: userId,
      idempotency_key: input.key,
      case_id: input.caseId,
      input_revision: input.inputRevision,
      operation_type: input.type,
      cache_key: input.cacheKey ?? null,
    })
    .select("id")
    .single();
  if (!error && data) return { fresh: true, id: data.id as string };
  if (error?.code === "23505") {
    const { data: existing } = await sb
      .from("operations")
      .select("id, status, result, error_code, created_at")
      .eq("idempotency_key", input.key)
      .single();
    if (existing) {
      const op = existing as OperationRow;
      // A "running" op older than the provider deadline is treated as failed so the worker can retry.
      if (op.status === "running" && Date.now() - Date.parse(op.created_at) > 120_000) {
        await finishOperation(sb, op.id, "failed", null, "abandoned");
        return { fresh: false, op: { ...op, status: "failed", error_code: "abandoned" } };
      }
      return { fresh: false, op };
    }
  }
  throw new HttpError("internal", "operation error");
}

export async function finishOperation(sb: SupabaseClient, id: string, status: "succeeded" | "failed", result: unknown, errorCode: string | null = null) {
  await sb.from("operations").update({ status, result, error_code: errorCode, updated_at: new Date().toISOString() }).eq("id", id);
}

/** Durable per-user daily cap on billed AI operations. */
export async function assertQuota(sb: SupabaseClient, type: OperationType, limit: number) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await sb
    .from("operations")
    .select("id", { count: "exact", head: true })
    .eq("operation_type", type)
    .gte("created_at", since);
  if (error) throw new HttpError("internal", "quota error");
  if ((count ?? 0) >= limit) throw new HttpError("quota_exceeded");
}

/** Per-owner cache lookup (RLS ensures results never cross users). */
export async function findCached<T>(sb: SupabaseClient, cacheKey: string): Promise<T | null> {
  const { data } = await sb
    .from("operations")
    .select("result")
    .eq("cache_key", cacheKey)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0]?.result as T | undefined) ?? null;
}
