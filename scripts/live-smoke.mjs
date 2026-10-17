// Live smoke test against the real Supabase project + local API on :3300.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REF = new URL(URL_).hostname.split(".")[0];
const BASE = "http://localhost:3300";
const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
const ok = (c, m) => console.log(`${c ? "PASS" : "FAIL"} ${m}`);
const created = [];

async function session(tag) {
  const email = `haqcheck-test-${tag}-${Date.now()}@example.com`, password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const c = createClient(URL_, PUB, { auth: { persistSession: false } });
  const s = await c.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  const cookie = `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(s.data.session)).toString("base64url")}`;
  return { cookie, id: data.user.id };
}

const call = (who, method, path, body) =>
  fetch(BASE + path, { method, headers: { cookie: who.cookie, origin: BASE, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

try {
  const A = await session("a"), B = await session("b");
  let r = await call(A, "POST", "/api/cases", { workType: "platform", issueType: "missing_incentive", platformLabel: "Demo Delivery", periodStart: "2026-10-03", periodEnd: "2026-10-03", description: "Test", descriptionSource: "typed" });
  ok(r.status === 201, `A creates case (${r.status})`);
  let c = r.json.case;

  // upload a fictional sample as evidence through the signed-URL flow
  const sbA = createClient(URL_, PUB, { auth: { persistSession: false } });
  await sbA.auth.setSession(JSON.parse(Buffer.from(A.cookie.split("base64-")[1], "base64url").toString()));
  for (const f of ["demo-offer-3-oct.png", "demo-day-summary-3-oct.png"]) {
    const bytes = readFileSync(`public/demo/${f}`);
    const init = await call(A, "POST", `/api/cases/${c.id}/evidence`, { filename: f, mime: "image/png", byteSize: bytes.length, workerRedacted: false });
    const up = await sbA.storage.from("evidence").uploadToSignedUrl(init.json.path, init.json.token, new Blob([bytes], { type: "image/png" }), { contentType: "image/png" });
    const done = await call(A, "POST", `/api/cases/${c.id}/evidence/${init.json.evidenceId}`, {});
    ok(init.status === 200 && !up.error && done.status === 200, `upload+verify ${f} (${init.status}/${up.error?.message ?? "ok"}/${done.status})`);
  }
  // fake (wrong-type) upload must be rejected after the fact
  const fake = Buffer.from("<svg onload=alert(1)>not an image</svg>".padEnd(2000, " "));
  const init2 = await call(A, "POST", `/api/cases/${c.id}/evidence`, { filename: "x.png", mime: "image/png", byteSize: fake.length, workerRedacted: false });
  await sbA.storage.from("evidence").uploadToSignedUrl(init2.json.path, init2.json.token, new Blob([fake], { type: "image/png" }), { contentType: "image/png" });
  const rej = await call(A, "POST", `/api/cases/${c.id}/evidence/${init2.json.evidenceId}`, {});
  ok(rej.status === 422, `fake image rejected server-side (${rej.status} ${rej.json?.error?.message})`);

  // live extraction, then repeated tap with same key does not re-run
  c = (await call(A, "GET", `/api/cases/${c.id}`)).json.case;
  const key = crypto.randomUUID();
  const t0 = Date.now();
  r = await call(A, "POST", `/api/cases/${c.id}/extract`, { expectedRevision: c.inputRevision, idempotencyKey: key });
  ok(r.status === 200 && Object.keys(r.json.case.facts).length >= 8, `live extract (${r.status}, ${Object.keys(r.json?.case?.facts ?? {}).length} facts, ${Date.now() - t0}ms)`);
  const r2 = await call(A, "POST", `/api/cases/${c.id}/extract`, { expectedRevision: c.inputRevision, idempotencyKey: key });
  ok(r2.status === 200 || r2.status === 409, `repeat tap same key does not re-bill (${r2.status})`);
  c = r.json.case;

  // stale revision rejected
  const k0 = Object.keys(c.facts)[0];
  r = await call(A, "PATCH", `/api/cases/${c.id}/facts`, { expectedRevision: c.inputRevision - 1, key: k0, fact: { ...c.facts[k0], reviewState: "confirmed" } });
  ok(r.status === 409, `stale revision rejected (${r.status})`);

  // confirm every fact (unreadable -> unknown), then check
  for (const [k, f] of Object.entries(c.facts)) {
    const fact = f.reviewState === "unreadable" ? { ...f, reviewState: "unknown_confirmed" } : f.reviewState === "conflict" ? { ...f, reviewState: "confirmed", alternative: null } : { ...f, reviewState: "confirmed" };
    r = await call(A, "PATCH", `/api/cases/${c.id}/facts`, { expectedRevision: c.inputRevision, key: k, fact });
    if (r.status !== 200) { ok(false, `confirm ${k} ${r.status}`); break; }
    c = r.json.case;
  }
  r = await call(A, "POST", `/api/cases/${c.id}/check`, { expectedRevision: c.inputRevision, idempotencyKey: crypto.randomUUID() });
  ok(r.status === 200 && r.json.case.check?.outcome === "possible_difference" && r.json.case.check.differencePaise === 30000, `check: ${r.json?.case?.check?.outcome} diff=${r.json?.case?.check?.differencePaise}`);
  c = r.json.case;
  r = await call(A, "POST", `/api/cases/${c.id}/complaint`, { expectedRevision: c.inputRevision, locale: "hi", idempotencyKey: crypto.randomUUID() });
  ok(r.status === 200 && r.json.case.complaint?.text?.length > 50, `complaint drafted source=${r.json?.case?.complaint?.source} note=${r.json?.note}`);
  c = r.json.case;
  r = await call(A, "PATCH", `/api/cases/${c.id}/complaint`, { action: "approve", expectedDraftRevision: c.complaint.revision });
  ok(r.status === 200 && r.json.case.workflowStatus === "complaint_ready", `approved -> ${r.json?.case?.workflowStatus}`);
  const ev = c.evidence[0];
  r = await call(A, "GET", `/api/cases/${c.id}/evidence/${ev.id}`);
  ok(r.status === 200 && r.json.url.includes("token="), `owner gets short-lived signed URL`);

  // cross-user isolation through the real API + RLS
  r = await call(B, "GET", `/api/cases/${c.id}`); ok(r.status === 404, `B cannot read A's case (${r.status})`);
  r = await call(B, "GET", `/api/cases/${c.id}/evidence/${ev.id}`); ok(r.status === 404, `B cannot get A's file URL (${r.status})`);
  r = await call(B, "PATCH", `/api/cases/${c.id}/facts`, { expectedRevision: c.inputRevision, key: k0, fact: c.facts[k0] }); ok(r.status === 404, `B cannot edit A's facts (${r.status})`);
  r = await call(B, "DELETE", `/api/cases/${c.id}`); ok(r.status === 404, `B cannot delete A's case (${r.status})`);
  r = await call(B, "GET", `/api/cases`); ok(r.status === 200 && r.json.cases.length === 0, `B's list is empty`);
  const sbB = createClient(URL_, PUB, { auth: { persistSession: false } });
  await sbB.auth.setSession(JSON.parse(Buffer.from(B.cookie.split("base64-")[1], "base64url").toString()));
  const dl = await sbB.storage.from("evidence").list(`${A.id}/${c.id}`);
  ok((dl.data ?? []).length === 0, `B cannot list A's storage folder`);
  const anon = await fetch(`${URL_}/storage/v1/object/public/evidence/${A.id}/${c.id}/x`); ok(anon.status >= 400, `no public bucket access (${anon.status})`);
  r = await fetch(BASE + "/api/cases", { headers: { cookie: A.cookie, origin: "https://evil.example" }, method: "POST", body: "{}" }); ok(r.status === 403, `cross-origin POST blocked (${r.status})`);

  // earnings idempotent upsert
  const entry = { clientId: crypto.randomUUID(), workType: "daily_wage", periodStart: "2026-09-21", periodEnd: "2026-09-30", platformLabel: null, ratePaise: 70000, fullDays: 8, halfDays: 0, paidPaise: 200000, advancesPaise: 0 };
  await call(A, "POST", "/api/earnings", entry); await call(A, "POST", "/api/earnings", entry);
  r = await call(A, "GET", "/api/earnings"); ok(r.json.entries.length === 1, `earnings sync retry does not duplicate (${r.json.entries.length})`);

  // delete case removes files
  r = await call(A, "DELETE", `/api/cases/${c.id}`); ok(r.json?.status === "deleted", `A deletes case (${r.json?.status})`);
  const left = await admin.storage.from("evidence").list(`${A.id}/${c.id}`); ok((left.data ?? []).length === 0, `case files removed from storage`);
} catch (e) {
  console.log("ERROR", e.message ?? e);
} finally {
  for (const id of created) {
    const { data } = await admin.storage.from("evidence").list(id);
    for (const f of data ?? []) { const { data: o } = await admin.storage.from("evidence").list(`${id}/${f.name}`); if (o?.length) await admin.storage.from("evidence").remove(o.map((x) => `${id}/${f.name}/${x.name}`)); }
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`cleaned up ${created.length} test users`);
}
