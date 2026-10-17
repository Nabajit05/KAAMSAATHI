# HaqCheck

HaqCheck is a mobile-first web app (Hindi and English) that helps Indian gig and daily-wage workers understand a payment, check a possible mistake, and prepare an evidence-backed complaint. A worker adds screenshots or typed figures, confirms each extracted fact, and gets a deterministic (non-AI) check with one of three honest outcomes: "The records match", "Possible payment difference" or "More information needed". The worker can then review and edit a plain-language complaint and copy, share or print it. HaqCheck never submits anything for the worker and does not make legal determinations. Stack: Next.js 15 (App Router), Supabase (email sign-in link now, phone OTP once SMS is configured; Postgres with RLS; private Storage), Gemini (reading screenshots, drafting, voice-to-text and text-to-speech). All demo data is fictional ("Demo Delivery").

Status: private pilot / synthetic demo only. It has had no legal or security review. See [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) for what is verified and what is not.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

The demo ("Try an example") works with no keys and no database. Without `GEMINI_API_KEY` the demo shows clearly labelled "Recorded demo result" extractions and the complaint falls back to a "Standard factual draft". Private cases (sign-in, uploads, saved case history) need Supabase; live AI needs Gemini.

Note: npm 12 blocked dependency install scripts (for example `sharp`), but the prebuilt binaries work, so no extra step is needed. If `sharp` fails to load, run `npm rebuild sharp`.

## Environment

```bash
cp .env.example .env.local
```

Fill in the variables you have. `.env.example` separates public variables (`NEXT_PUBLIC_*`) from server secrets. Only `NEXT_PUBLIC_SUPABASE_URL` and the publishable key reach the browser. Never put service-role or provider keys in a `NEXT_PUBLIC_` variable. Missing integrations disable only their own feature with a visible state (`GET /api/health` reports booleans only).

## Supabase setup

1. Create a Supabase project.
2. Apply the migrations in `supabase/migrations/` in order:
   - `20261017000001_init.sql` (tables, composite foreign keys, RLS policies, grants)
   - `20261017000002_storage.sql` (private `evidence` bucket and storage policies)

   Either run `supabase link --project-ref <ref>` then `supabase db push`, or paste each file into the SQL editor. Do not run them against a database you do not own; they are written for a fresh project.
3. The `evidence` bucket (private, 8 MB limit, JPEG/PNG/WebP only) is created by the second migration. No manual bucket step.
4. In Authentication, enable the Phone provider and connect an SMS provider (for example Twilio, MessageBird or Vonage). Without an SMS provider, sign-in cannot work; the app never fakes SMS or has a fixed OTP. Configure Supabase's own OTP rate limits and CAPTCHA/abuse protection.
5. In Authentication, URL configuration: set the Site URL to your deployed origin and add redirect URLs for it (and `http://localhost:3000` for local work).
6. Copy the project URL and publishable key into `.env.local`. Copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY` (server only; used only for account deletion).

The `guidance_sources` table exists but is not populated or read by the app: Help content is served from `src/content/guidance.ts`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: unit tests plus integration tests (RLS tests run real migrations in an in-process Postgres via PGlite, no Supabase needed) |
| `npm run test:e2e` | Playwright (builds and serves on port 3100). `tests/e2e/` currently contains no specs; see IMPLEMENTATION-STATUS.md |
| `npm run fixtures` | Re-renders the fictional sample PNGs in `public/demo/` from `src/fixtures/documents.ts` |

## Deployment

- Any Node host works (for example Vercel). Set the environment variables from `.env.example` in the host's settings.
- Serve over HTTPS (the app sends HSTS). Add the deployed origin to Supabase Site URL and redirects.
- Set the host's function timeout to at least 60 seconds. `POST /api/cases/[id]/extract` declares `maxDuration = 60` and a provider call can take up to `AI_TIMEOUT_MS` (default 25 s), with one possible retry on invalid output.
- `next.config.ts` sets `outputFileTracingIncludes` for `/api/demo/extract` so `public/demo/**` (the fictional sample images read from disk) is bundled into that serverless function. Keep it if you change hosts or tracing.
- Rate limiting in route handlers is in memory per instance (see limitations). Per-user AI quotas are enforced in the database.
- Before enabling real worker data: review Gemini data-processing and retention terms, and complete legal/security review. Keep it a private pilot until then.
- Rollback: redeploy the previous build; migrations are additive and there are no down-migrations, so back up before schema changes. Supabase backups may retain deleted data for a provider-defined period.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - trust boundaries, data ownership, payment semantics, AI pipeline, extension points
- [SOURCES.md](SOURCES.md) - Help content sources, review dates, exclusions, design references
- [DEMO.md](DEMO.md) - fictional fixtures A-E and the two-minute walkthrough
- [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) - implemented/verified, unverified, blocked, deferred
- [TEST-REPORT.md](TEST-REPORT.md) - commands actually run and their results (maintained separately)
- `HaqCheck-Claude-Code-Build-Prompt.txt` - the original build brief

## Live project setup used on 2026-10-17

- Migrations applied to the Supabase project via the Management API (`SUPABASE_ACCESS_TOKEN` in `.env.local`).
- Sign-in: `NEXT_PUBLIC_AUTH_METHOD=email` (magic link to `/auth/callback`). Free-tier Supabase cannot edit email templates without custom SMTP, so the email carries a link, not a code, and the built-in mailer sends at most 2 emails per hour. Add custom SMTP before a pilot.
- Live smoke test: `set -a; . ./.env.local; set +a; npx next dev -p 3300` then `node scripts/live-smoke.mjs` (creates and deletes two throwaway users).
