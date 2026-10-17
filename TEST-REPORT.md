# HaqCheck test report

Everything below was observed in the runs described; nothing is inferred.

## Commands run

```
npx vitest run                 # 6 files, 109 tests: 109 passed, 0 failed (1.2 s)
npx tsc --noEmit               # no errors reported
npx playwright test            # 70 test executions (35 per project x 2 projects): 66 passed, 0 failed, 4 skipped (about 57 s)
```

`npx playwright test` starts its own server (`playwright.config.ts`): it rsyncs the project into `$TMPDIR/haqcheck-e2e-build`
(excluding `.next`, `node_modules` and `.env*`), runs `npm run build`, then `next start -p 3100`. The copy keeps the run away from the
project's `.next` directory, and excluding `.env*` makes the run a no-credentials run (see "Integrations"). Set `PW_REUSE_SERVER=1`
to reuse a server already on port 3100 while iterating.
Projects: `mobile` (Pixel 7 profile at 390x844, Chromium) and `desktop` (Desktop Chrome). Chromium only.

## Playwright results (tests/e2e)

| Area | File | Result |
|---|---|---|
| 1. Hindi Fixture A: Hindi toggle and cookie, confirm all, change incentive to 250, check shows 600 / 250 / 350, Hindi complaint, approve, copy enabled, print page Hindi text | hindi-incentive.spec.ts | pass |
| Complaint edit after approval disables copy and re-requires approval; approval appears in case timeline | hindi-incentive.spec.ts | pass |
| 2. Fixture B: records match, "No missing incentive...", no complaint button, no recovery wording | results.spec.ts | pass |
| 3. Fixture C: "More information needed", no tiles, no rupee amount, "What's missing", "Add the missing record" | results.spec.ts | pass |
| 4. E: balance 3,600 (5,600 expected / 2,000 received), "Only from numbers you entered"; D: match, 800; A: 600 / 300 / 300 | results.spec.ts | pass |
| 5. Earnings: device-only note and consent; daily-wage entry persists across reload; no-consent entry is memory only; offline add (`context.setOffline`) shows "Saved on this device", one entry after reconnect and reload; invalid money gives `aria-invalid` and focus | earnings.spec.ts | pass |
| 6. Keyboard: Enter opens Change, Escape closes and focus returns to the Change button, error text is linked via `aria-describedby`, save returns focus | keyboard.spec.ts | pass |
| 7. axe (wcag2a, wcag2aa, wcag21aa, wcag22aa): `/`, `/demo`, `/help`, `/earnings`, `/sign-in`, review (A), result (A), complaint (A, after draft), Hindi review (C) | a11y.spec.ts | pass, 0 violations on all 9 pages, both viewports |
| 8. Real login and private case save/reload | misc.spec.ts | skipped: no Supabase credentials in the test run |
| Signed-in earnings offline queue sync | earnings.spec.ts | skipped: needs real auth |
| 9. 320px: no horizontal scroll on `/`, `/home`, `/demo`, result (English and Hindi) | layout.spec.ts | pass |
| Help (Call 112 `tel:112`, 3 sections, each item shows "Reviewed"), sign-in "not set up yet", locale toggle and `hc_locale` cookie, honest "Live reading is not set up" | misc.spec.ts | pass |

The 4 skipped runs are the 2 skipped tests on each project.
Two further tests use `test.fail` to record known app bugs (below). They report as passed while the bug exists and will start failing once it is fixed, at which point the `test.fail` should be removed.

axe covered only the states listed. Dialogs, error states, the evidence viewer and the Hindi complaint page were not scanned.
axe finds only part of the accessibility problems; it does not replace a screen-reader pass.

## App bugs found (src/ was not edited)

1. "How we checked" shows the offer target as a rupee amount. `src/domain/incentive.ts:103` pushes the step
   `{ label: "offer_threshold", amount, count: threshold, ... }` with both `amount` (the offer amount) and `count` (the order threshold).
   The renderers prefer `amount` (result page `src/app/cases/[id]/result/page.tsx`, print page `src/app/cases/[id]/print/page.tsx`).
   Repro: /demo, "Incentive paid less", confirm all, "Check my payment", open "How we checked". The row reads "Offer target ₹600" when it should read 30 orders.
   The print sheet has the same row. Covered by `results.spec.ts` (test.fail).
2. The "Changed since you approved it. Please read it again." notice can never appear. `complaint/page.tsx` shows it when
   `d.approvedRevision !== null && !approved`, but `withComplaintText` (`src/domain/case.ts:200`) sets `approvedRevision: null` on any edit.
   Observed behaviour: after an edit the approve button comes back and Copy is disabled, with no explanation. Covered by `hindi-incentive.spec.ts` (test.fail).
3. Misleading rate-limit message. `src/server/http.ts:123` / `src/app/api/demo/complaint/route.ts:21` limits drafts to 6 per minute per IP, but the UI shows
   `error.quota` ("You've reached today's limit for this. Please try again tomorrow.", `src/locales/en.ts:535`). Observed while running tests.
4. The rate-limit key is `x-forwarded-for` taken from the request (`clientIp`, `src/server/http.ts:137`). A client can set that header to get a fresh bucket.
   My tests do this on purpose (`isolateRateLimit` in `tests/e2e/helpers.ts`). It matters only if the app is not behind a proxy that overwrites the header.
5. Not a bug, a spec difference: on a "records match" result (Fixture B) the app shows Expected / Received / Difference tiles, all ₹0, not "no Difference tile".
   The test asserts ₹0 and no recovery claim. Decide whether this is the intended design.

## Integrations: live versus mocked

- Supabase (auth, storage, RLS): NOT exercised live. RLS/ownership was verified in vitest integration tests by running the real migrations in PGlite with an `auth.uid()` shim.
  That is not live Supabase and does not go through the API gateway. Playwright ran with no Supabase credentials, so auth reports "Sign-in is not set up yet" and private cases cannot be created.
- AI (Gemini): no live Gemini call and no live smoke test by me. Playwright asserts the honest fallbacks only: complaint = "Standard factual draft" template, and sample live reading says
  "Live reading is not set up, so the recorded demo result is shown." Vitest uses fakes.
- Sarvam STT/TTS: not tested at all.
- Environment note: `/Users/nabajitpaul/Documents/HaqCheck/.env.local` exists and has Supabase URL/publishable key, a service-role key and a Gemini key set.
  My first Playwright run copied it into the build and the app then called live Gemini (one `demo_extract` call, about 16 s, appeared in the server log) and showed the phone sign-in form.
  The config now excludes `.env*`, so all reported results are from no-credentials runs. A live smoke test with those keys (synthetic fixtures only) was not run and is still open.
- The first Playwright attempt built in the project's own `.next` and clobbered it (a dev server using that directory would have broken); the isolated copy was introduced after that.
  No dev server on port 3000 was running when I checked later, and I did not start or stop one.

## Manual QA not performed

200% zoom, long Hindi text review, a screen-reader pass (VoiceOver/TalkBack), the real mobile camera/gallery flow, share sheet and clipboard permission fallbacks,
throttled-network load timing and bundle-size measurement, a console/failed-request review beyond test failures, and real-device testing (everything was desktop Chromium with emulated Pixel 7 at 390x844, plus 320x640 for overflow).
Lint (`npm run lint`) was not run by me.

## Untested risks

- Live Supabase auth, storage and RLS through the API gateway, and the real session/cookie flow.
- Phone OTP sign-in.
- Live Gemini extraction quality and prompt-injection behaviour on real screenshots.
- Sarvam speech-to-text and text-to-speech.
- Signed-in offline sync queue and idempotent replay against a real server.
- Real-device camera/upload.
- Browsers other than Chromium (Safari/Firefox, iOS Safari especially).
- The demo rate-limit buckets are in process memory, so behaviour on serverless/multi-instance hosting is untested.


## Update after fixes (2026-10-17)

The app bugs found by the E2E suite were fixed and the two `test.fail` markers removed:
- "How we checked" now shows the offer target as an order count (`src/domain/incentive.ts`).
- Editing an approved complaint now shows "Changed since you approved it" (`withComplaintText` keeps the old approval revision).
- Rate-limit responses show "wait a minute" instead of the daily-quota message (`error.rateLimited`).
- `clientIp` prefers the proxy-set `x-real-ip`, then the last `X-Forwarded-For` hop, instead of the client-controllable first hop.

Re-run after fixes: `npx vitest run` → 109/109 passed; `npx playwright test` → 66 passed, 4 skipped (login + signed-in sync need credentials), 0 failed.

Live integrations (separate from this suite): `scripts/live-smoke.mjs` against the real Supabase project and Gemini → 22/22 checks passed (see IMPLEMENTATION-STATUS.md).
