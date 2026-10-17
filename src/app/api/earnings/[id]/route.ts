import { NextResponse } from "next/server";
import { HttpError, route } from "@/server/http";
import { requireUser } from "@/server/supabase";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_req, { params }: Ctx) => {
  const { sb } = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError("not_found");
  const { data, error } = await sb.from("earnings_entries").delete().eq("id", id).select("id");
  if (error) throw new HttpError("internal", "database error");
  if (!data?.length) throw new HttpError("not_found");
  return NextResponse.json({ status: "deleted" });
});
