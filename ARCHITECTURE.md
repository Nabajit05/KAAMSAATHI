# Architecture

One Next.js 15 app: UI routes in `src/app`, pure logic in `src/domain`, server-only code in `src/server`, shared request/response schemas in `src/shared`, curated content in `src/content`, fictional fixtures in `src/fixtures`, strings in `src/locales` (en, hi). Supabase provides auth, Postgres and private Storage. Gemini is called only from server route handlers (extraction, drafting, speech-to-text, text-to-speech).

## Trust boundaries

| Zone | Trusted? | Notes |
| --- | --- | --- |
| Browser | No | Validates for usability only. Never holds provider keys or the service-role key. Holds the Supabase session cookie managed by `@supabase/ssr` (not claimed to be HttpOnly). |
| Route handlers (`src/app/api/**/route.ts`) | Yes | Every handler is wrapped by `route()` in `src/server/http.ts`: request id, strict same-origin check on mutations (CSRF defence), safe error mapping (stable code, retryable flag, request id, no stack traces), `cache-control: no-store`. Bodies are parsed with zod and size-capped. |
| Supabase (RLS, Storage policies) | Yes | Second line of defence even if a route has a bug. |
| Gemini | No | Output is untrusted data: schema-validated, re-parsed by our own code, never auto-confirmed. |
| Uploaded images, transcripts | No | Treated as data. Instructions embedded in them are ignored (system prompts say so; they have no tool access). No arbitrary URL fetching anywhere. |

`requireUser()` (`src/server/supabase.ts`) calls `auth.getUser()` (verified with Supabase Auth, not just cookie decoding) and returns the user id. All private reads/writes use the user-scoped client so RLS applies. The service-role client (`adminClient()`) is used only in `DELETE /api/account`, and only for the verified caller's own id.

## Data ownership

- `owner_id` always comes from the verified session (`default auth.uid()` in the database, or `userId` from `requireUser()`), never from a request body.
- RLS is enabled on every user table with `USING` and `WITH CHECK` on `auth.uid()`. Child tables also require, in `WITH CHECK`, that the parent case exists and is owned by the caller.
- Child tables (`case_facts`, `check_runs`, `complaint_drafts`, `evidence`, `case_events`, `operations`, optionally `earnings_entries`) reference `cases (id, owner_id)` with a composite foreign key, so a row cannot point at another owner's case even if policies were misconfigured. `evidence.storage_key` has a CHECK that it starts with `<owner_id>/<case_id>/`.
- Storage bucket `evidence` is private (8 MB, JPEG/PNG/WebP). Object policies (select, insert, delete) require the first path segment to equal `auth.uid()`, and insert also requires the second segment to be a case owned by the caller. Object names are random UUIDs. Viewing uses a 120-second signed URL issued after an ownership check.
- Another user's case id returns `not_found`, same as a missing one.
- `guidance_sources` is world-readable, writable by no client role. It is currently unused by the app.
- Tables, policies and the above properties are exercised by `tests/integration/rls.test.ts` against the real migration SQL in PGlite. The same test file also exercises the storage-object policies against a minimal `storage` schema stand-in in PGlite, not a hosted Storage service (see IMPLEMENTATION-STATUS.md).

## Payment semantics

Money is integer paise (`src/domain/money.ts`). `parseMoney` reads the decimal string (no floats), handles Devanagari digits, Indian and international grouping, `Rs.`/`INR`/`₹`/`/-`, rejects other currencies, more than two decimals and values above INR 1 crore. `formatINR` uses Indian grouping.

Facts (`src/domain/facts.ts`) carry provenance (`record`, `worker_entered`, `worker_stated`) and review state (`unreviewed`, `confirmed`, `edited`, `unreadable`, `conflict`, `unknown_confirmed`). A check only uses facts that are `confirmed` or `edited` and non-null. A check cannot run while any critical field is unreviewed, unreadable or in conflict (`pendingReview`). "I don't know" is a valid answer and keeps the value null.

Unknown is not zero. Optional components absent from the record count as zero; components explicitly marked unknown block the conclusion. Missing evidence yields `more_info_needed` with named missing fields, never a guessed amount.

Formulas (rule versions `incentive-v1`, `settlement-v1`, `daily-wage-v1`):

- Incentive (`incentive.ts`): eligibility is three-valued (`met` / `not_met` / `unknown`). Offer date and activity date must match, else `dates_differ`. Below the lowest threshold: `records_match` (no incentive established), even if some was credited. At or above the threshold, offer conditions must be fully visible and zone/shift must be `met`; otherwise `more_info_needed` (or `records_match` if the condition is `not_met`). Expected incentive: one tier reached, that tier's amount; multiple tiers reached, `stacking` sums them, `highest_only` takes the highest, unknown mode blocks. Observed = credited + pending. Difference = expected - observed; positive means `possible_difference`.
- Settlement (`settlement.ts`): gross = base + earned incentive + in-app tips + earnings adjustment. Expected settlement = gross - cash retained (COD) - advance recovery. Cash retained and advances are offsets, not lost earnings. Fuel and other expenses are never subtracted from expected payout; they only feed `netAfterRecordedExpenses` (gross minus recorded expenses, flagged `expenses_incomplete` if either is missing). A non-zero or unknown unclassified deduction blocks reconciliation. Status other than `settled` (pending, partial) blocks it. Observed higher than expected is reported as `records_match` (`settlement_more_than_expected`), not a discrepancy.
- Daily wage (`dailyWage.ts`): earned = rate x full days + (rate / 2) x half days (an odd-paise half-day rounds half up and is disclosed); balance = earned - payments - advances. Unconfirmed days are excluded and reported separately.

The earnings summary (`earnings.ts`) keeps earned, payout, offsets and recorded expenses separate, and marks totals `complete: false` when any contributing value is unknown.

Every `CheckResult` records `ruleVersion`, `inputRevision`, steps (the "How we checked" lines), used fields and a strength label (`records` / `mixed` / `worker_only`). No model-generated confidence is shown.

Stale invalidation: `case.inputRevision` is bumped whenever a fact value or provenance changes (`withFact`). A check or complaint whose revision differs from the case's is stale (`isCheckStale`, `isComplaintStale`); editing a fact also withdraws complaint approval. Editing complaint text also clears approval (`withComplaintText`). Approving a stale complaint is refused. Workflow status (`draft` ... `resolved`) is separate from calculation outcome; "submitted" and "resolved" are set only by worker-reported events.

## AI pipeline

1. Authenticate, authorize the case, and verify uploads server-side (`imageCheck.ts`): magic-byte sniffing must match the declared type, decoded by `sharp` with a 40-megapixel limit, at least 64x64, not animated, 8 MB cap, SHA-256, duplicate rejection per case. The original object is kept unmodified; a 2400 px WebP derivative without EXIF/GPS is written for AI reading. Location presence is detected only to disclose it.
2. `POST /api/cases/[id]/extract` makes one structured Gemini request for all pending images (`responseJsonSchema`, temperature 0, output capped at 4096 tokens, timeout `AI_TIMEOUT_MS`). The system prompt tells the model to copy only visible values, never infer, and ignore instructions in images.
3. Output is validated against the zod `extractionSchema` (`src/shared/contracts.ts`). Invalid output gets one more attempt; then `ai_invalid_output`.
4. `extractToFacts.ts` re-parses every value with our own parsers (`parseField.ts`), drops unknown fields and document ids not belonging to the request, keeps disagreeing documents as `conflict`, clips excerpts, and produces only `unreviewed` facts with `provenance: record`. Schema compliance is not treated as factual correctness.
5. `mergeFacts.ts` merges into the case without overwriting confirmed or worker-entered values; disagreements become conflicts with both values preserved. The write is conditioned on the revision read before the call, so an old extraction cannot overwrite newer edits.
6. The worker confirms, corrects or marks each critical fact unknown (`PATCH /api/cases/[id]/facts`, with expected revision; the server will not let a worker relabel a typed value as a `record`).
7. `POST /api/cases/[id]/check` runs the deterministic check (no AI).
8. `POST /api/cases/[id]/complaint` builds a prompt from confirmed facts, the calculation and one allowlisted guidance snippet, asks Gemini for a short draft, strips markup, and validates every number in it against a grounding set (`groundingFor` / `unsupportedNumbers` in `complaint.ts`: confirmed amounts, counts, dates, check outputs). Unsupported numbers trigger one repair request; if that fails, or the provider is unavailable, times out or is over quota, the deterministic template (`templateComplaint`) is used and labelled "Standard factual draft". The draft is only a draft: approval, copy, share and print are worker actions, and nothing is sent.
9. `POST /api/speech/synthesize` is on demand from a text the client sends (max 1500 chars); audio is streamed back and not stored. `POST /api/speech/transcribe` forwards audio (max 2 MB, allowlisted types) to Gemini (audio understanding) and returns only an editable transcript; audio is not stored. A short transcript is kept in the `operations` row to serve idempotent replays.

Adapter interfaces (`src/server/ai/types.ts`): `Extractor`, `Drafter`, `Transcriber`, `Synthesizer`. `providers` in `ai/index.ts` returns `null` when a key is missing so callers fall back honestly.

Not checked by the number validator: dates in prose forms, identifiers other than a recorded ticket id, and non-numeric claims. The prompt rules and the worker's review are the controls there.

## Idempotency, quota, caching (`operations` table)

- Every billed or state-changing operation inserts a row with a client idempotency key; `unique (owner_id, idempotency_key)` makes concurrent duplicates safe. A repeat returns the existing operation's outcome instead of calling a provider again. A `running` operation older than 120 s is treated as abandoned so the worker can retry.
- Quotas: `assertQuota` counts the caller's operations of that type in a rolling 24 hours (RLS scopes the count to the owner) against `DAILY_EXTRACT_LIMIT`, `DAILY_DRAFT_LIMIT`, `DAILY_SPEECH_LIMIT`. Over the draft quota, drafting degrades to the template rather than failing.
- Extraction cache: `cache_key = extract:<model>:schema-v1:<sorted evidence sha256 list>`, looked up only among the caller's own operations (RLS), so results never cross users.
- In-memory limiter (`rateLimit` in `http.ts`) bounds bursts per instance only.

## Security headers and CSP

`next.config.ts` sets on every route: Content-Security-Policy (`default-src 'self'`; images/connect allow only self plus the Supabase origin; `object-src 'none'`; `frame-ancestors 'none'`; `form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera and microphone for self only, geolocation and payment off), HSTS, `X-Robots-Tag: noindex, nofollow`. `poweredByHeader` is off.

Hardening item: `script-src` includes `'unsafe-inline'` because Next.js App Router injects inline bootstrap scripts and we do not yet use nonces. `'unsafe-eval'` is added in development only. Moving to a nonce-based CSP via middleware is deferred. `style-src` also allows `'unsafe-inline'`.

Logs (`logOp`) contain event names, request ids, error categories and counts, not document contents, transcripts, phone numbers or secrets.

## Offline

`public/sw.js` (registered in production only) caches the public shell: `/`, `/help`, `/demo`, `/home`, `/earnings`, `/_next/static/*`, `/demo/*` and image/font assets. It never touches `/api/*` (so no private responses or signed URLs are cached) and ignores non-GET requests. Help content is compiled into the client bundle, so it is available offline with the shell, with its review dates.

Earnings entries (`src/features/earnings/store.ts`) get a client-generated `clientId`; `POST /api/earnings` upserts on `(owner_id, client_id)`, so retries, reconnects and second tabs do not duplicate. Queued entries live in memory unless the worker consents to device storage, in which case they are kept in localStorage with expiry (queue 7 days, device entries 30 days). Device storage is refused when the shared-phone preference is on, and is cleared by `clearDeviceData`. States shown are distinct: saved on device, waiting for connection, syncing, saved, failed. AI features do not run offline and are never shown as queued-complete.

## Demo isolation

Demo cases are created client-side from fixtures (`src/fixtures/demo.ts`) and held in `sessionStorage` (with an in-memory fallback). They never touch the database. Two unauthenticated routes exist:

- `POST /api/demo/extract` accepts only `{ fixtureId }`; images are read from `public/demo/` on the server, never uploaded. Per-IP rate limit, 5-minute per-fixture coalescing, in-memory.
- `POST /api/demo/complaint` accepts a fixture id, locale, idempotency key and a structured fact set validated by `demoDraftSchema`. The server rebuilds the case from the fixture, requires all critical facts reviewed, re-runs the deterministic check, and drafts from that. No free text is accepted. Per-IP limit plus `DEMO_DAILY_LIMIT` per instance per day.

Without a Gemini key the demo uses recorded facts, labelled "Recorded demo result", and the template draft.

## Extension points

- New platform adapter: add field keys and `FIELD_DEFS` entries (`facts.ts`), a `check<Platform>()` returning `CheckResult` with a new `*_RULE_VERSION`, map it in `checkTypeFor`/`runCheck` (`case.ts`), add field labels (`features/review/fieldMeta.ts`), extend `EXTRACTABLE_FIELDS`/`EXTRACTION_JSON_SCHEMA` and the extraction prompt, add reason codes in `result.ts` and strings in both locales, and add tests in `tests/unit/checks.test.ts`.
- New language: add `src/locales/<code>.ts` matching the `en.ts` shape, register it in `locales/index.ts`, extend the `Locale` type and the DB `check` constraints on `locale` columns, add Hindi-like template text in `complaint.ts`, and check the Gemini transcription prompt in `src/server/ai/gemini.ts`.
- New guidance item: append to `GUIDANCE` in `src/content/guidance.ts` with a verified official URL, bilingual text, `reviewedOn` and `needsHumanVerification`; add the source to `SOURCES.md`; bump `GUIDANCE_VERSION`. Only items on this list may be shown or given to the drafter (`DRAFT_GUIDANCE_IDS`).
