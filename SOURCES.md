# Sources

Browsing was available during the build. Every Help item in `src/content/guidance.ts` (version `2026-10-17.1`) was checked against its linked official page and marked reviewed on 2026-10-17. All items are for India, national level only; there is no state-specific guidance. Government pages change: re-open each source before relying on it, and update `reviewedOn` and `GUIDANCE_VERSION` when you do. Items marked "needs human verification" carry that flag in the app.

## Help content (src/content/guidance.ts)

| ID | Section | Source URL | Jurisdiction | Reviewed | Supports | Freshness limits / human verification |
| --- | --- | --- | --- | --- | --- | --- |
| `keep-proof-ask-platform` | Payment | none (practice guidance by HaqCheck) | n/a | 2026-10-17 | Save screenshots, note dates/IDs/amounts, ask platform support in writing | Not a legal source and makes no legal claim. Not flagged for verification. |
| `social-security-code-gig-workers` | Payment | https://www.pib.gov.in/PressReleasePage.aspx?PRID=2200767 | India (national) | 2026-10-17 | Code on Social Security, 2020 in force from 21 Nov 2025; gig/platform workers recognised; e-Shram registration; aggregator-funded Social Security Fund; benefits via notified schemes; no fixed pay rate or minimum payout | Press release, not the statute or rules. Scheme details are still being notified. Needs human verification. |
| `nalsa-free-legal-aid` | Payment | https://nalsa.gov.in/faqs/ | India (national; state income limits vary) | 2026-10-17 | Free legal aid for listed groups; district legal services office, online, or helpline 15100 | Eligibility depends on the person and state limits; we do not assess it. Needs human verification. |
| `emergency-112` | Safety | https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2220125 | India (national; run by states) | 2026-10-17 | 112 as the single emergency number; help after road accidents | Verified through PIB because 112.gov.in was unreachable. Emergency numbers are static text, so they work without AI. |
| `ambulance-108-highway-1033` | Safety | https://nhm.gov.in/index1.php?lang=1&level=2&sublinkid=1217&lid=189 (and NHAI "Dial 1033", PIB PRID 2265867) | India (national; 108 is state-run) | 2026-10-17 | 108 ambulance; NHAI 1033 highway helpline | 108 service varies by state. The PIB 1033 reference is cited in the item's source title, not as a separate link. |
| `helmet-bis-certified` | Safety | https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2142409 | India (national) | 2026-10-17 | Helmet required for two-wheelers under the Motor Vehicles Act, 1988; BIS/ISI-marked helmets (IS 4151:2015) | Press release summary of the standard; state enforcement differs. |
| `heatwave-outdoor-work` | Safety | https://ndma.gov.in/en/heat-wave-dos-donts | India (national) | 2026-10-17 | Hydration, head covering, avoiding 12 noon to 3 pm outdoors where possible, first response to heat stroke | General public-health guidance, not diagnosis. Does not advise continuing work. |
| `eshram-registration` | Welfare | https://eshram.gov.in/faqs | India (national) | 2026-10-17 | Who can register (age 16+, unorganised/gig work, not EPFO/ESIC member), free registration with Aadhaar and linked mobile, helpdesk 14434; registration does not itself pay money | The FAQ shows age 16+ and no income criteria. Rules can change; re-check before use. |
| `eshram-linked-schemes` | Welfare | https://www.pib.gov.in/PressReleasePage.aspx?PRID=2220307 | India (national) | 2026-10-17 | Central schemes linked to e-Shram (PMSBY, PMJJBY); separate eligibility and applications | PM-JAY cover for platform workers was announced but not confirmed live; the item says so. Needs human verification. |
| `myscheme-discovery` | Welfare | https://www.myscheme.gov.in/about | India (national) | 2026-10-17 | myScheme as the official place to discover central and state schemes and check eligibility | Does not imply any API, partnership or eligibility from HaqCheck. |

## Excluded or unverified claims

These are deliberately not shown as facts:

From the header of `guidance.ts`:
- A Samadhan or Shram Suvidha route for gig workers.
- A live PM-JAY health cover specifically for platform workers.
- An operational gig-worker helpline under the Social Security Code.
- Any minimum-payout guarantee.
- Rider fatigue guidance.

Additional findings:
- The Samadhan portal was not confirmed to accept gig-worker complaints.
- Shram Suvidha is an employer compliance portal, not a worker complaint route.
- No operational gig-worker helpline under the Social Security Code was found.
- PM-JAY for platform workers is announced but not confirmed live.
- No minimum payout guarantee was found.
- The e-Shram FAQ shows age 16+ and no income criteria (used in `eshram-registration`).
- No authoritative rider fatigue guidance was found, so none is shown.
- 112.gov.in was unreachable during review; 112 was verified through PIB instead.

Also not asserted anywhere: statutory complaint deadlines, legal compensation, guaranteed welfare eligibility, platform support emails or grievance portals.

## Background research cited in the brief (not used as app content)

The brief lists these as research context; none is displayed as a claim in the app, and success rates, recovery amounts or partnerships are never shown.
- Fairwork India 2024 overview: https://fairwork.oii.ox.ac.uk/en/fw/blog/fairwork-indias-sixth-report-examines-the-changing-nature-of-platform/
- GigSaathi / Forced Volatility report (local pilot): https://irl.works/blog/2026/06/12/gigsaathi-earnings-incentives-gigwork-india.pdf
- TGPWU impact evaluation (200 union members): https://tgpwu.org/2025/08/13/tgpwus-impact-evaluation-report-2024/
- Aajeevika worker assistance: https://aajeevika.org/what-we-do-program/
- Janpahal/GigWA survey reporting: https://www.business-standard.com/economy/news/platform-workers-face-high-occupational-risks-limited-protection-survey-126090301509_1.html
- Haqdarshak: https://www.haqdarshak.com/

## Design and engineering references

- GOV.UK Design System, question pages: https://design-system.service.gov.uk/patterns/question-pages/
- Material Design 3: https://m3.material.io/
- WCAG 2.2 quick reference: https://www.w3.org/WAI/WCAG22/quickref/
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase phone login: https://supabase.com/docs/guides/auth/phone-login
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Gemini models (model id verified 2026-10-17): https://ai.google.dev/gemini-api/docs/models
- Gemini image understanding: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini audio (speech-to-text) and TTS models: model ids `gemini-3.8-flash` and `gemini-3.8-flash-tts` confirmed via the models endpoint for the configured key on 2026-10-17. Sarvam was evaluated and then replaced by Gemini at the project owner's request.

Accessibility is targeted at WCAG 2.2 AA. Automated checks do not establish full conformance, and no formal audit has been done.

## Three borrowed interaction principles

1. One question at a time, with Back and "I don't know" (from GOV.UK question pages): adapted: each fact on the review page has its own "Is this correct?" with Correct, Change and "I don't know" controls, and answers are preserved. Facts are grouped on one page rather than shown one per screen, so this is only a partial application of the pattern.
2. Familiar, labelled bottom navigation and real stage progress (from Material 3): Home, Earnings, Cases, Help; the stage bar derives from real case state (records, check the details, result, complaint), not fake percentages.
3. Persistent labels, an error summary linking to fields, and visible focus (from GOV.UK and WCAG 2.2).

No logos, screens or illustrations were copied.

## Source-update responsibility

The deploying team owns re-review. Suggested cadence: before any real-worker launch, then at least quarterly, and immediately if a source URL changes or an official scheme announcement lands. Helplines (112, 108, 1033, 15100, 14434) should be re-verified before each release.
