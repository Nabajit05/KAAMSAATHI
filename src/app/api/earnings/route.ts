import { NextResponse } from "next/server";
import { HttpError, parseJson, rateLimit, route } from "@/server/http";
import { requireUser } from "@/server/supabase";
import { earningsEntrySchema, type EarningsEntry } from "@/shared/contracts";

interface Row {
  id: string;
  client_id: string;
  work_type: "platform" | "daily_wage";
  period_start: string;
  period_end: string;
  data: Record<string, unknown>;
  created_at: string;
}

const toEntry = (r: Row) => ({ ...r.data, id: r.id, clientId: r.client_id, workType: r.work_type, periodStart: r.period_start, periodEnd: r.period_end, createdAt: r.created_at, provenance: "worker_entered" }) as EarningsEntry;

export const GET = route(async () => {
  const { sb } = await requireUser();
  const { data, error } = await sb.from("earnings_entries").select("*").order("period_start", { ascending: false }).limit(200);
  if (error) throw new HttpError("internal", "database error");
  return NextResponse.json({ entries: (data as Row[]).map(toEntry) });
});

/**
 * Upsert keyed by the client-generated id, so an offline entry synced twice
 * (retry, reconnect, second tab) is stored once.
 */
export const POST = route(async (req) => {
  const { sb, userId } = await requireUser();
  rateLimit(`earnings:${userId}`, 60, 60 * 60_000);
  const body = await parseJson(req, earningsEntrySchema);
  if (body.periodEnd < body.periodStart) throw new HttpError("validation_failed", "period", { periodEnd: "before start" });
  const { clientId, workType, periodStart, periodEnd, ...data } = body;
  const { data: row, error } = await sb
    .from("earnings_entries")
    .upsert({ client_id: clientId, owner_id: userId, work_type: workType, period_start: periodStart, period_end: periodEnd, data }, { onConflict: "owner_id,client_id", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error || !row) throw new HttpError("internal", "database error");
  return NextResponse.json({ entry: toEntry(row as Row) });
});
