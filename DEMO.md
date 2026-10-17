# Demo guide

Everything in the demo is fictional. The provider is "Demo Delivery", which does not exist. The sample screens in `public/demo/` are generated from `src/fixtures/documents.ts` (`npm run fixtures`), carry a "FICTIONAL DEMO DATA" watermark, and every demo view shows a "Fictional demo data" banner. Nothing here is a real platform's statement or policy. Demo cases are held in the browser session only (`sessionStorage`); they are never stored on a server.

## Fixtures

Open "Try an example" (`/demo`). Names are placeholders; there are no personas with personal details, only these situations.

| Fixture | Situation | What is on the sample records | Expected result |
| --- | --- | --- | --- |
| A - possible shortfall | Offer: INR 600 for 30 orders on 3 Oct 2026, Sector 18, shift 11:00-23:00, no other conditions. 32 qualifying orders. INR 300 credited, INR 0 pending. | Offer screen plus day summary | Possible payment difference: expected INR 600, credited INR 300, difference INR 300, "based on the records you confirmed" |
| B - correctly paid | Same offer, 29 orders, INR 0 credited | Same offer plus a day summary with 29 orders | The records match: threshold not met (29 of 30), no missing incentive established |
| C - incomplete evidence | Cropped offer (no date, zone/shift line cut off) and an orders screen with no date and no pending line | Two cropped screenshots | More information needed. Unreadable fields (offer date, zone/shift, activity date, pending incentive) must be marked "I don't know" or entered before the check can run; the result then names the missing fields and shows no amount |
| D - settlement misunderstanding | Week 28 Sep - 4 Oct 2026. Order pay INR 1,000, incentive INR 200, COD cash retained INR 300, advance recovery INR 100, bank transfer INR 800, settled. Worker adds fuel INR 150. | Weekly settlement screen | The records match: expected settlement 1,000 + 200 - 300 - 100 = INR 800. Gross earnings INR 1,200; earnings after the recorded fuel expense INR 1,050, flagged as incomplete (other costs unrecorded). The advance is explained as not lost earnings and fuel is not subtracted from the payout |
| E - daily wage | 21-30 Sep 2026. Agreed INR 700/day, 8 confirmed days, INR 2,000 paid, no advances. | None: all values are "Entered by you" | Possible payment difference: earned INR 5,600, received INR 2,000, balance INR 3,600. Labelled as worker-entered, not corroborated by a document. A ledger is not conclusive legal proof |

Notes:
- Fixtures A-D start with a "Recorded demo result": the extracted facts were prepared in advance and are shown with that label. They were not read live.
- Facts start unreviewed. The check stays disabled until the worker confirms, edits or marks "I don't know" for every critical fact.
- Complaints name placeholders for name and partner ID ("[Your name]", "[Your partner ID]"); the worker fills them in.

## Two-minute walkthrough (works with no keys)

1. Open http://localhost:3000. Pick Hindi or English (language switcher in the header). Tap "Try an example".
2. Choose Fixture A. Read the description (typed text; voice input needs sign-in). Continue to the evidence step and open a sample record to show the watermark and the "Recorded demo result" notice.
3. Continue to the review step. For each fact, show the quoted text from the record. Correct one value (for example change the credited amount) to show the check responds, then change it back, or confirm all as is.
4. Run the check. Show the outcome, the "How we checked" lines, and which facts are from records versus entered by you. Note that editing any fact afterwards marks the result stale until rechecked.
5. Prepare the complaint. Without a Gemini key it appears as "Standard factual draft". Edit a word and show that approval is withdrawn; approve again; then copy or open the printable summary. Exporting is not submitting; the "I submitted it" record is the worker's own entry.
6. Start Fixture C. Show that the check is blocked until the unreadable fields are reviewed, and that after marking them "I don't know" the result is "More information needed" with named missing fields and no amount.
7. Briefly show Earnings (entries keep earnings, payout and expenses separate; unknown is not zero), and Help (curated items, each with source link and review date; emergency numbers are static text).

Optional, only after setting `GEMINI_API_KEY`:
- On the evidence step of Fixtures A-D, tap "Read the sample live with AI". The server sends the fictional sample images to Gemini, validates the result, and the notice changes to "Read by AI just now". Facts are still unreviewed until confirmed.
- On the complaint step the draft can then come from Gemini (validated against the confirmed numbers, with one repair attempt) instead of the template. If validation fails or the call errors, it falls back to "Standard factual draft".
- Without a key, "Read the sample live with AI" shows that live reading is not set up and keeps the recorded result. Do not describe the recorded result as live.

Not demonstrable without credentials: sign-in with phone OTP, private cases saved across reloads, uploading your own screenshots, voice input and audio playback, account export and deletion.
