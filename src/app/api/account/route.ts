import { NextResponse } from "next/server";
import { z } from "zod";
import { loadCases } from "@/server/caseRepo";
import { HttpError, logOp, parseJson, rateLimit, route } from "@/server/http";
import { adminClient, requireUser } from "@/server/supabase";

/** Download my data: cases, confirmed facts, checks, complaints, events and earnings. No file URLs. */
export const GET = route(async () => {
  const { sb, userId } = await requireUser();
  rateLimit(`export:${userId}`, 5, 60 * 60_000);
  const [cases, earnings, profile] = await Promise.all([
    loadCases(sb),
    sb.from("earnings_entries").select("*"),
    sb.from("profiles").select("*").maybeSingle(),
  ]);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), profile: profile.data, cases, earnings: earnings.data ?? [] }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="haqcheck-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});

/**
 * Deletes every stored file, then the auth user (cascading all rows).
 * Requires typing DELETE. Reports "pending" truthfully if any step fails.
 */
export const DELETE = route(async (req, _ctx: unknown, requestId) => {
  const { sb, userId } = await requireUser();
  rateLimit(`delete-account:${userId}`, 3, 60 * 60_000);
  await parseJson(req, z.object({ confirm: z.literal("DELETE") }));
  const admin = adminClient();
  if (!admin) throw new HttpError("not_configured");

  // Remove files case by case (paths are <owner>/<case>/<object>).
  const { data: folders } = await sb.storage.from("evidence").list(userId, { limit: 1000 });
  let filesOk = true;
  for (const f of folders ?? []) {
    const prefix = `${userId}/${f.name}`;
    const { data: objs, error } = await sb.storage.from("evidence").list(prefix, { limit: 1000 });
    if (error) {
      filesOk = false;
      continue;
    }
    if (objs?.length) {
      const { error: rmError } = await sb.storage.from("evidence").remove(objs.map((o) => `${prefix}/${o.name}`));
      if (rmError) filesOk = false;
    }
  }
  if (!filesOk) {
    logOp("account_delete_partial", { requestId });
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }
  // The admin call targets only the verified caller's own id.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    logOp("account_delete_failed", { requestId });
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }
  await sb.auth.signOut();
  return NextResponse.json({ status: "deleted" });
});
