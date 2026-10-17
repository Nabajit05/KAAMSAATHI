import { test, expect } from "@playwright/test";
import { demoToResult } from "./helpers";

test.use({ viewport: { width: 320, height: 640 } });

async function noOverflow(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(320);
}

for (const path of ["/", "/home", "/demo"]) {
  test(`320px no horizontal scroll: ${path}`, async ({ page }) => {
    await page.goto(path);
    await noOverflow(page);
  });
}

test("320px no horizontal scroll: result page (A) and Hindi result", async ({ page }) => {
  await demoToResult(page, "A");
  await noOverflow(page);
  await page.goto("/");
  await page.getByRole("button", { name: "हिंदी", exact: true }).first().click();
  await demoToResult(page, "A");
  await noOverflow(page);
});
