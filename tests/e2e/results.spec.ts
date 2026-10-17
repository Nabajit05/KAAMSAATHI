import { test, expect } from "@playwright/test";
import { demoToResult } from "./helpers";

test.describe("results by fixture (English)", () => {
  test("A: possible difference 600 / 300 / 300", async ({ page }) => {
    await demoToResult(page, "A");
    await expect(page.getByRole("heading", { name: "Possible payment difference" })).toBeVisible();
    const tiles = page.locator("dl.tabular").first();
    await expect(tiles.locator("div", { hasText: "Expected" }).first()).toContainText("₹600");
    await expect(tiles.locator("div", { hasText: "Received" }).first()).toContainText("₹300");
    await expect(tiles.locator("div", { hasText: "Difference" }).first()).toContainText("₹300");
    await expect(page.getByText("It is not a legal decision")).toBeVisible();
    await expect(page.getByRole("button", { name: "Prepare a complaint" })).toBeVisible();
    await page.locator("summary", { hasText: "How we checked" }).click();
    await expect(page.locator("details table")).toBeVisible();
  });

  test("B: target not reached - records match, no false discrepancy or recovery claim", async ({ page }) => {
    await demoToResult(page, "B");
    await expect(page.getByRole("heading", { name: "The records match" })).toBeVisible();
    await expect(page.getByText("No missing incentive is shown by these records")).toBeVisible();
    const body = page.locator("main, body").first();
    await expect(body).not.toContainText("Possible payment difference");
    // The app shows an Expected/Received/Difference tile row for matches, all ₹0: assert it shows no non-zero difference.
    const tiles = page.locator("dl.tabular").first();
    await expect(tiles.locator("div", { hasText: "Difference" }).first()).toContainText("₹0");
    await expect(tiles).not.toContainText("₹600");
    await expect(page.getByRole("button", { name: "Prepare a complaint" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ask the company to explain" })).toBeVisible();
    await expect(body).not.toContainText(/you are owed|recover (₹|your)|you should receive/i);
  });

  test("C: missing conditions - more information needed, no amount claimed", async ({ page }) => {
    await demoToResult(page, "C");
    await expect(page.getByRole("heading", { name: "More information needed" })).toBeVisible();
    await expect(page.getByText("What's missing")).toBeVisible();
    await expect(page.locator("dl.tabular")).toHaveCount(0);
    await expect(page.getByText("Possible payment difference")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Prepare a complaint" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Add the missing record" })).toBeVisible();
    const headline = await page.locator("section[aria-labelledby=outcome]").innerText();
    expect(headline).not.toMatch(/₹/);
  });

  test("D: bank settlement matches, expected 800", async ({ page }) => {
    await demoToResult(page, "D");
    await expect(page.getByRole("heading", { name: "The records match" })).toBeVisible();
    await expect(page.locator("dl.tabular").first()).toContainText("₹800");
    await expect(page.getByText("Possible payment difference")).toHaveCount(0);
  });

  test("E: contractor daily wage balance 3,600 from entered numbers", async ({ page }) => {
    await demoToResult(page, "E");
    await expect(page.getByRole("heading", { name: "Possible payment difference" })).toBeVisible();
    const tiles = page.locator("dl.tabular").first();
    await expect(tiles).toContainText("₹5,600");
    await expect(tiles).toContainText("₹2,000");
    await expect(tiles).toContainText("₹3,600");
    await expect(page.getByText("Only from numbers you entered")).toBeVisible();
  });
});

// KNOWN APP BUG (src/domain/incentive.ts:103): the "Offer target" step carries both amount (offer amount) and count
// (threshold); renderers prefer the amount, so the target row shows "₹600" instead of "30 orders".
test.fail("A: 'How we checked' shows the offer target as an order count (known bug: shows rupee amount)", async ({ page }) => {
  await demoToResult(page, "A");
  await page.locator("summary", { hasText: "How we checked" }).click();
  const row = page.locator("details table tr", { hasText: "Offer target" });
  await expect(row).toContainText(/30/);
  await expect(row).not.toContainText("₹");
});
