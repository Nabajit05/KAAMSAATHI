-- HaqCheck initial schema.
-- Every user-owned table carries owner_id, has row-level security enabled, and
-- uses USING + WITH CHECK policies on auth.uid(). Child rows reference their
-- case through a composite (case_id, owner_id) foreign key, so a row can never
-- point at a case owned by somebody else, even if a server bug tried to.


-- Profiles ------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'hi')),
  display_name text check (char_length(display_name) <= 60),
  shared_device boolean not null default false,
  consent_version text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cases ---------------------------------------------------------------------
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  work_type text not null check (work_type in ('platform', 'daily_wage')),
  issue_type text not null check (issue_type in ('missing_incentive', 'deduction', 'payout_mismatch', 'not_sure', 'wage_due')),
  platform_label text check (char_length(platform_label) <= 60),
  period_start date,
  period_end date,
  timezone text not null default 'Asia/Kolkata',
  description text not null default '' check (char_length(description) <= 1000),
  description_source text check (description_source in ('typed', 'voice')),
  workflow_status text not null default 'draft'
    check (workflow_status in ('draft', 'checked', 'complaint_ready', 'submitted', 'resolved', 'closed')),
  current_input_revision integer not null default 1 check (current_input_revision > 0),
  follow_up_date date,
  submission jsonb,
  worker_outcome jsonb,
  deletion_state text not null default 'active' check (deletion_state in ('active', 'deleting', 'delete_failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_period_order check (period_end is null or period_start is null or period_end >= period_start),
  constraint cases_id_owner_unique unique (id, owner_id)
);
create index cases_owner_updated_idx on public.cases (owner_id, updated_at desc);

-- Facts: one row per input revision (audit trail of what the worker confirmed).
create table public.case_facts (
  case_id uuid not null,
  owner_id uuid not null,
  revision integer not null check (revision > 0),
  schema_version text not null,
  facts jsonb not null,
  created_at timestamptz not null default now(),
  primary key (case_id, revision),
  foreign key (case_id, owner_id) references public.cases (id, owner_id) on delete cascade
);

create table public.check_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  owner_id uuid not null,
  input_revision integer not null,
  rule_version text not null,
  outcome text not null check (outcome in ('records_match', 'possible_difference', 'more_info_needed')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (case_id, owner_id) references public.cases (id, owner_id) on delete cascade
);
create index check_runs_case_idx on public.check_runs (case_id, created_at desc);

create table public.complaint_drafts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique,
  owner_id uuid not null,
  check_input_revision integer not null,
  locale text not null check (locale in ('en', 'hi')),
  body text not null check (char_length(body) <= 6000),
  source text not null check (source in ('ai', 'template', 'recorded_demo')),
  revision integer not null default 1,
  approved_at timestamptz,
  approved_revision integer,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (case_id, owner_id) references public.cases (id, owner_id) on delete cascade
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  owner_id uuid not null,
  storage_key text not null unique,
  derivative_key text unique,
  submitted_filename text not null check (char_length(submitted_filename) <= 120),
  declared_mime text not null check (declared_mime in ('image/jpeg', 'image/png', 'image/webp')),
  verified_mime text check (verified_mime in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer check (byte_size > 0 and byte_size <= 8388608),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploading'
    check (status in ('uploading', 'uploaded', 'reading', 'read', 'failed', 'deleting', 'delete_failed')),
  worker_redacted boolean not null default false,
  metadata_note text check (char_length(metadata_note) <= 200),
  created_at timestamptz not null default now(),
  foreign key (case_id, owner_id) references public.cases (id, owner_id) on delete cascade,
  -- Storage paths are always <owner>/<case>/<random>, checked here as well as in storage policies.
  constraint evidence_key_scoped check (storage_key like owner_id::text || '/' || case_id::text || '/%')
);
create index evidence_case_idx on public.evidence (case_id);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  owner_id uuid not null,
  event_type text not null,
  actor text not null check (actor in ('worker', 'system')),
  meta jsonb check (pg_column_size(meta) <= 2000),
  at timestamptz not null default now(),
  foreign key (case_id, owner_id) references public.cases (id, owner_id) on delete cascade
);
create index case_events_case_idx on public.case_events (case_id, at);

-- Earnings ------------------------------------------------------------------
create table public.earnings_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null,
  case_id uuid,
  work_type text not null check (work_type in ('platform', 'daily_wage')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  data jsonb not null check (pg_column_size(data) <= 4000),
  provenance text not null default 'worker_entered' check (provenance in ('worker_entered', 'record')),
  created_at timestamptz not null default now(),
  unique (owner_id, client_id),
  foreign key (case_id, owner_id) references public.cases (id, owner_id) on delete set null (case_id)
);
create index earnings_owner_period_idx on public.earnings_entries (owner_id, period_start desc);

-- Operations: idempotency and bounded AI processing --------------------------
create table public.operations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  case_id uuid,
  input_revision integer,
  operation_type text not null check (operation_type in ('extract', 'check', 'draft', 'transcribe', 'synthesize')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  cache_key text,
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  foreign key (case_id, owner_id) references public.cases (id, owner_id) on delete cascade
);
create index operations_owner_type_time_idx on public.operations (owner_id, operation_type, created_at desc);
create index operations_cache_idx on public.operations (owner_id, cache_key) where cache_key is not null;

-- Public guidance (read-only to clients; written only by migrations/admin) ---
create table public.guidance_sources (
  id text primary key,
  jurisdiction text not null,
  category text not null check (category in ('payment', 'safety', 'welfare')),
  official_url text,
  title text not null,
  reviewed_at date not null,
  content jsonb not null,
  content_sha256 text
);

-- Row-level security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_facts enable row level security;
alter table public.check_runs enable row level security;
alter table public.complaint_drafts enable row level security;
alter table public.evidence enable row level security;
alter table public.case_events enable row level security;
alter table public.earnings_entries enable row level security;
alter table public.operations enable row level security;
alter table public.guidance_sources enable row level security;

create policy profiles_own on public.profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cases_own on public.cases for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Child tables: the row must be yours AND its case must be yours.
create policy case_facts_own on public.case_facts for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.cases c where c.id = case_id and c.owner_id = auth.uid()));

create policy check_runs_own on public.check_runs for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.cases c where c.id = case_id and c.owner_id = auth.uid()));

create policy complaint_drafts_own on public.complaint_drafts for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.cases c where c.id = case_id and c.owner_id = auth.uid()));

create policy evidence_own on public.evidence for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.cases c where c.id = case_id and c.owner_id = auth.uid()));

create policy case_events_own on public.case_events for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.cases c where c.id = case_id and c.owner_id = auth.uid()));

create policy earnings_own on public.earnings_entries for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.owner_id = auth.uid())));

create policy operations_own on public.operations for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.owner_id = auth.uid())));

create policy guidance_public_read on public.guidance_sources for select to anon, authenticated using (true);

-- Least privilege for API roles.
revoke all on all tables in schema public from anon;
grant select on public.guidance_sources to anon;
grant select, insert, update, delete on
  public.profiles, public.cases, public.case_facts, public.check_runs, public.complaint_drafts,
  public.evidence, public.case_events, public.earnings_entries, public.operations
  to authenticated;
grant select on public.guidance_sources to authenticated;
