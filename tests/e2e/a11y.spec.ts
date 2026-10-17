import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { isolateRateLimit, confirmAll, demoToResult, gotoReview, runCheck, startExample } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateRateLimit(context);
});

const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  if (summary.length) console.log(`AXE ${label}:\n  ${summary.join("\n  ")}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

for (const path of ["/", "/demo", "/help", "/earnings", "/sign-in"]) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    await scan(page, path);
  });
}

test("axe: review page", async ({ page }) => {
  await startExample(page, "A");
  await gotoReview(page);
  await scan(page, "review");
});

test("axe: result page", async ({ page }) => {
  await demoToResult(page, "A");
  await scan(page, "result");
});

test("axe: complaint page (after draft)", async ({ page }) => {
  await demoToResult(page, "A");
  await page.getByRole("button", { name: "Prepare a complaint" }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Write the complaint" }).click();
  await expect(page.locator("textarea")).toBeVisible();
  await scan(page, "complaint");
});

test("axe: review page in Hindi", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "हिंदी", exact: true }).first().click();
  await startExample(page, "C");
  await gotoReview(page);
  await scan(page, "review-hi (fixture C)");
});
void confirmAll; void runCheck;
