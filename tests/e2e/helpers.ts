import { expect, type Page } from "@playwright/test";

export type Fx = "A" | "B" | "C" | "D" | "E";

const TITLES: Record<Fx, RegExp> = {
  A: /Incentive paid less|इंसेंटिव कम मिला/,
  B: /Target not reached|टारगेट पूरा नहीं हुआ/,
  C: /Screenshot cut off|स्क्रीनशॉट कटा हुआ/,
  D: /Bank transfer looks low|बैंक में कम पैसा आया/,
  E: /Contractor wages due|ठेकेदार की मज़दूरी बाकी/,
};

export async function startExample(page: Page, fx: Fx) {
  await page.goto("/demo");
  await page.getByRole("button", { name: TITLES[fx] }).click();
  await page.waitForURL(fx === "E" ? /\/cases\/demo-[^/]+\/review/ : /\/cases\/demo-[^/]+\/evidence/);
}

export async function gotoReview(page: Page) {
  if (/\/evidence/.test(page.url())) {
    await page.getByRole("link", { name: /^(Continue|आगे बढ़ें)/ }).click();
  }
  await page.waitForURL(/\/review/);
  await expect(page.locator("li[data-field]").first()).toBeVisible();
}

const DONT_KNOW = /^(I don't know|मुझे नहीं पता)$/;
const CORRECT = /^(Correct|सही है)$/;

/** Confirms every visible fact row the way a worker would (Correct / matching option / I don't know). */
export async function confirmAll(page: Page, opts: { skip?: string[] } = {}) {
  const rows = page.locator("li[data-field]:visible");
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    const key = (await row.getAttribute("data-field"))!;
    if (opts.skip?.includes(key)) continue;
    const correct = row.getByRole("button", { name: CORRECT });
    if (await correct.count()) {
      await correct.click();
      continue;
    }
    const pressed = await row.locator("button[aria-pressed='true']").count();
    const anyToggle = await row.locator("button[aria-pressed]").count();
    if (anyToggle && !pressed) {
      const valueText = ((await row.locator("p.tabular").first().textContent()) ?? "").trim();
      const opt = row.getByRole("button", { name: valueText, exact: true });
      if (valueText && (await opt.count())) await opt.click();
      else await row.getByRole("button", { name: DONT_KNOW }).click();
      continue;
    }
    const unknown = row.getByRole("button", { name: DONT_KNOW });
    const needs = (await row.getByText(/Could not read|पढ़ा नहीं जा सका/).count()) > 0;
    if (needs && (await unknown.count())) await unknown.click();
  }
}

export async function runCheck(page: Page) {
  await page.getByRole("button", { name: /^(Check my payment|मेरा भुगतान जाँचें)$/ }).click();
  await page.waitForURL(/\/result/);
}

/** Demo → confirm all → check → result page. */
export async function demoToResult(page: Page, fx: Fx) {
  await startExample(page, fx);
  await gotoReview(page);
  await confirmAll(page);
  await expect(page.getByText(/All important details are confirmed|सभी ज़रूरी|सारी ज़रूरी/)).toBeVisible();
  await runCheck(page);
}

/**
 * The demo complaint endpoint is rate limited per client IP (6/min, in memory). Give each test its own
 * synthetic X-Forwarded-For so tests don't consume each other's budget. This also documents that the limit keys on a client-supplied header.
 */
export async function isolateRateLimit(context: import("@playwright/test").BrowserContext) {
  const n = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
}
