# Implementation status

Last updated 2026-10-17. Be conservative: anything needing a live Supabase project, has been marked as verified only where it was exercised against the real service (see the live section). See [TEST-REPORT.md](TEST-REPORT.md) for commands actually run.

Recommended audience: synthetic demo and a small private pilot only. No legal or security review has been done.

## Implemented and verified

| Area | Evidence |
| --- | --- |
| Domain logic: money parsing/formatting (paise, Devanagari digits, grouping, range), incentive (three-valued eligibility, tiers), settlement (COD, advances, pending), daily wage (half days), earnings summaries, unknown vs zero, stale invalidation, complaint grounding/number validation | 109 Vitest tests pass (`npm test`, re-run during documentation: 6 files, 109 tests) |
| Database RLS and constraints from the real migration SQL | Integration tests (`tests/integration/rls.test.ts`) run `supabase/migrations/*.sql` in PGlite: owner isolation, cross-owner child inserts rejected, evidence key scoping, storage-object policies and private bucket, idempotency uniqueness, delete cascades, guidance read-only. This is a real Postgres engine with simulated `auth.uid()` and storage schema, not a hosted Supabase project |
| AI output handling with controlled fakes | `tests/unit/ai.test.ts`: schema validation, our own re-parsing, fabricated amounts blocked, repair then template fallback, injection text treated as data |
| Demo routes | `tests/integration/routes.test.ts`: template fallback without a key, unreviewed facts refused, wrong-type values rejected, cross-site requests rejected, repeated idempotency key returns the same result, no stack trace on malformed JSON, demo extract reports not-configured, health returns booleans only |
| Image verification | `tests/unit/ai.test.ts`: real `sharp` decoding, signature mismatch and tiny/oversized files rejected, GPS removed from the derivative only |
| Demo journey in a browser (manual) | Fixtures run at 375 px width, including Hindi: fact correction, check, template complaint, approval gating after edit |
| Production build | `npm run build` passes; first-load JS about 199-218 KB (measured by Next build output; compression and device/network conditions not separately measured) |

## Verified live (2026-10-17, real Supabase project + Gemini, `scripts/live-smoke.mjs`, 22/22 checks)

| Area | Result |
| --- | --- |
| Migrations applied to hosted Supabase | 10 public tables with RLS enabled; private `evidence` bucket (8 MB); 3 storage policies |
| Private case API as a signed-in user | create, signed-URL upload of 2 images, server byte verification (fake image rejected 422), live extraction (9 facts, ~12 s), stale revision 409, confirm facts, check (₹300 difference), AI complaint in Hindi (source=ai), approve, signed view URL |
| Cross-user isolation through API + RLS + Storage | second user gets 404 on read, file URL, fact edit and delete; empty list; cannot list owner's storage folder; no public bucket access; cross-origin POST 403 |
| Idempotency | repeated extract tap does not re-run; earnings re-sync stores one row |
| Deletion | case delete removes rows and storage objects |
| Live Gemini on fictional samples | Fixtures A, B, C, D read correctly; C's cut-off fields returned unreadable rather than guessed |
| Live AI drafting | Hindi and English drafts complete and grounded (after fixing truncation: low thinking level + MAX_TOKENS rejection) |
| Gemini speech | TTS of Hindi text and transcription round-trip tested by script (not through the browser recorder) |

## Implemented but unverified (needs credentials or was not exercised)

| Feature | Why unverified |
| --- | --- |
| Phone OTP sign-in | Phone auth is disabled in the project (needs Twilio etc.); email magic-link sign-in is configured but no real inbox login was performed — the live test signed in with admin-created test users |
| Voice recording in the browser → Gemini transcription, and Listen button | Routes need sign-in; not exercised through a real browser microphone |
| Account export and account deletion (`/api/account`) | Not exercised live |
| Signed-in earnings queue sync with client ids | Server upsert and queue logic written; not exercised against a live database. The offline reconnect flow in a browser is unverified |
| Service worker in a production build | Written, registered in production only; offline behaviour not verified in a browser |
| Copy / share / print of the complaint, `/cases/[id]/print` with Hindi text | Not recorded as verified |
| Accessibility: keyboard flows, focus restoration, screen reader, 320 px and 200% zoom, axe | Not run; `tests/e2e/` has no specs, so no automated axe or Playwright results exist |
| Security headers and CSP in a deployed environment | Configured in `next.config.ts`; not checked against a deployed origin |

## Blocked (waiting on credentials)

- SMS provider for phone sign-in (Twilio etc.) and custom SMTP for email volume beyond 2/hour.
- Review of Gemini data-processing/retention terms before real worker data.

## Deferred

- P2 items from the brief: additional platform formats, additional languages, richer redaction UI, advanced PDF export, partner dashboards, automated follow-up interpretation.
- Playwright end-to-end specs from brief section 13 (config exists; `tests/e2e/` is empty) and axe runs.
- Nonce-based CSP (currently `script-src 'unsafe-inline'`).
- Durable, distributed rate limiting (current limiter is in memory).
- PDF upload (only JPEG, PNG, WebP are accepted; no dead PDF path).
- Seeding or using the `guidance_sources` table (Help is served from `src/content/guidance.ts`).
- Server-side retention/expiry jobs for cases, evidence and operations.
- Partial-deletion retry job (failures are reported as "pending"; there is no background retry).
- Legal and security review, and a documented AI-provider data-retention check.

## Known limitations

- Rate limits in route handlers are in memory per instance and reset on restart; they are not shared across serverless instances. Only the per-user daily AI quotas (database-backed) are durable.
- Demo extraction and demo drafts are cached in memory per instance, and the demo daily cap is per instance.
- Hindi complaint templates use combined gendered forms ("करता/करती"); wording has not been reviewed by a native-speaker or legal reviewer.
- Complaint number validation checks numbers and counts only; other claims rely on prompt rules and worker review.
- No retention period is enforced by the code. Deleting a case or account removes stored files and rows, but provider (Supabase, Gemini) backups and logs may persist for provider-defined periods. A short transcript is kept in the `operations` row for idempotent replay.
- The Supabase session cookie is managed by `@supabase/ssr`; we do not claim it is HttpOnly.
- Help content covers India (national) only, reviewed 2026-10-17, and needs periodic human re-verification (see SOURCES.md).
- The demo reads and writes browser `sessionStorage`; clearing it loses demo cases.
- Treat as a private pilot or synthetic demo until legal/security review is complete.
