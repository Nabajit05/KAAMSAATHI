/**
 * Runs the real migrations in PGlite (Postgres compiled to WASM) and checks
 * row-level security and ownership constraints with two users.
 * The `auth` and `storage` schemas are minimal shims of Supabase's:
 * auth.uid() reads the JWT subject claim exactly as Supabase does.
 * This verifies our SQL policies; it does not exercise Supabase's API gateway.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
let caseA: string;

const SHIM = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid default auth.uid());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
`;

async function as(user: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? ""]);
    return tx.query(sql, params);
  });
}

async function expectFail(user: string | null, sql: string, params: unknown[] = []) {
  await expect(as(user, sql, params)).rejects.toThrow();
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SHIM);
  const dir = join(process.cwd(), "supabase", "migrations");
  await db.exec(readFileSync(join(dir, "20261017000001_init.sql"), "utf8"));
  await db.exec(readFileSync(join(dir, "20261017000002_storage.sql"), "utf8"));
  await db.query(`insert into auth.users (id) values ($1), ($2)`, [A, B]);
  const r = await as(A, `insert into public.cases (work_type, issue_type) values ('platform', 'missing_incentive') returning id, owner_id`);
  const row = r.rows[0] as { id: string; owner_id: string };
  expect(row.owner_id).toBe(A); // owner defaults to the verified identity
  caseA = row.id;
  await as(A, `insert into public.case_facts (case_id, owner_id, revision, schema_version, facts) values ($1, $2, 1, 'v1', '{}')`, [caseA, A]);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("cases RLS", () => {
  it("owner can read their case", async () => {
    const r = await as(A, `select id from public.cases where id = $1`, [caseA]);
    expect(r.rows).toHaveLength(1);
  });

  it("another user sees nothing and cannot tell the case exists", async () => {
    const r = await as(B, `select id from public.cases where id = $1`, [caseA]);
    expect(r.rows).toHaveLength(0);
    const f = await as(B, `select * from public.case_facts where case_id = $1`, [caseA]);
    expect(f.rows).toHaveLength(0);
  });

  it("another user cannot update or delete it", async () => {
    const u = await as(B, `update public.cases set description = 'x' where id = $1 returning id`, [caseA]);
    expect(u.rows).toHaveLength(0);
    const d = await as(B, `delete from public.cases where id = $1 returning id`, [caseA]);
    expect(d.rows).toHaveLength(0);
    const still = await as(A, `select description from public.cases where id = $1`, [caseA]);
    expect((still.rows[0] as { description: string }).description).toBe("");
  });

  it("cannot create a case owned by someone else", async () => {
    await expectFail(B, `insert into public.cases (owner_id, work_type, issue_type) values ($1, 'platform', 'deduction')`, [A]);
  });

  it("anonymous users cannot read cases but can read public guidance", async () => {
    await expectFail(null, `select * from public.cases`);
    const g = await as(null, `select * from public.guidance_sources`);
    expect(g.rows).toHaveLength(0);
    await expectFail(null, `insert into public.guidance_sources (id, jurisdiction, category, title, reviewed_at, content) values ('x','IN','safety','t','2026-10-17','{}')`);
    await expectFail(A, `insert into public.guidance_sources (id, jurisdiction, category, title, reviewed_at, content) values ('x','IN','safety','t','2026-10-17','{}')`);
  });
});

describe("child rows cannot attach to another owner's case", () => {
  it("rejects facts claiming the other user's ownership", async () => {
    await expectFail(B, `insert into public.case_facts (case_id, owner_id, revision, schema_version, facts) values ($1, $2, 2, 'v1', '{}')`, [caseA, A]);
  });

  it("rejects facts with own owner_id pointing at someone else's case (composite FK)", async () => {
    await expectFail(B, `insert into public.case_facts (case_id, owner_id, revision, schema_version, facts) values ($1, $2, 2, 'v1', '{}')`, [caseA, B]);
  });

  it("rejects events, drafts, operations and evidence on another user's case", async () => {
    await expectFail(B, `insert into public.case_events (case_id, owner_id, event_type, actor) values ($1, $2, 'note', 'worker')`, [caseA, B]);
    await expectFail(B, `insert into public.complaint_drafts (case_id, owner_id, check_input_revision, locale, body, source) values ($1, $2, 1, 'en', 'x', 'template')`, [caseA, B]);
    await expectFail(B, `insert into public.operations (owner_id, idempotency_key, case_id, operation_type) values ($1, gen_random_uuid(), $2, 'extract')`, [B, caseA]);
    await expectFail(
      B,
      `insert into public.evidence (case_id, owner_id, storage_key, submitted_filename, declared_mime) values ($1, $2, $3, 'a.png', 'image/png')`,
      [caseA, B, `${B}/${caseA}/x`],
    );
  });

  it("rejects evidence keys outside the owner's case folder", async () => {
    await expectFail(
      A,
      `insert into public.evidence (case_id, owner_id, storage_key, submitted_filename, declared_mime) values ($1, $2, $3, 'a.png', 'image/png')`,
      [caseA, A, `${B}/${caseA}/x`],
    );
    const ok = await as(
      A,
      `insert into public.evidence (case_id, owner_id, storage_key, submitted_filename, declared_mime) values ($1, $2, $3, 'a.png', 'image/png') returning id`,
      [caseA, A, `${A}/${caseA}/ok`],
    );
    expect(ok.rows).toHaveLength(1);
  });

  it("rejects attaching earnings to someone else's case", async () => {
    await expectFail(
      B,
      `insert into public.earnings_entries (client_id, case_id, work_type, period_start, period_end, data) values (gen_random_uuid(), $1, 'platform', '2026-10-01', '2026-10-07', '{}')`,
      [caseA],
    );
  });
});

describe("idempotency", () => {
  it("allows one operation per owner and key", async () => {
    const key = "33333333-3333-4333-8333-333333333333";
    await as(A, `insert into public.operations (idempotency_key, case_id, operation_type) values ($1, $2, 'extract')`, [key, caseA]);
    await expectFail(A, `insert into public.operations (idempotency_key, case_id, operation_type) values ($1, $2, 'extract')`, [key, caseA]);
    // A different user may use the same key value without seeing A's operation.
    await as(B, `insert into public.operations (idempotency_key, operation_type) values ($1, 'transcribe')`, [key]);
    const r = await as(B, `select * from public.operations where idempotency_key = $1`, [key]);
    expect(r.rows).toHaveLength(1);
  });
});

describe("private storage policies", () => {
  it("only lets owners write and read objects under their own case folder", async () => {
    await as(A, `insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [`${A}/${caseA}/img1`]);
    await expectFail(B, `insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [`${A}/${caseA}/img2`]);
    // B's own folder but A's case id: rejected because the case is not B's.
    await expectFail(B, `insert into storage.objects (bucket_id, name) values ('evidence', $1)`, [`${B}/${caseA}/img3`]);
    const seenByB = await as(B, `select name from storage.objects`);
    expect(seenByB.rows).toHaveLength(0);
    const seenByA = await as(A, `select name from storage.objects`);
    expect(seenByA.rows).toHaveLength(1);
    const delByB = await as(B, `delete from storage.objects returning name`);
    expect(delByB.rows).toHaveLength(0);
  });

  it("bucket is private", async () => {
    const r = await db.query(`select public from storage.buckets where id = 'evidence'`);
    expect((r.rows[0] as { public: boolean }).public).toBe(false);
  });
});

describe("deletion cascades", () => {
  it("deleting a case removes its facts, evidence rows and events", async () => {
    const c = await as(A, `insert into public.cases (work_type, issue_type) values ('daily_wage', 'wage_due') returning id`);
    const id = (c.rows[0] as { id: string }).id;
    await as(A, `insert into public.case_events (case_id, owner_id, event_type, actor) values ($1, $2, 'created', 'worker')`, [id, A]);
    await as(A, `delete from public.cases where id = $1`, [id]);
    const ev = await as(A, `select * from public.case_events where case_id = $1`, [id]);
    expect(ev.rows).toHaveLength(0);
  });
});
