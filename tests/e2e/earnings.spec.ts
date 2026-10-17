import { test, expect, type Page } from "@playwright/test";

async function fillDaily(page: Page) {
  await page.getByRole("button", { name: "Daily wage" }).click();
  await page.getByLabel("App or company").fill("Contractor Sharma");
  await page.getByLabel("Pay per day").fill("700");
  await page.getByLabel("Full days").fill("8");
  await page.getByLabel("Half days").fill("0");
  await page.getByLabel("Payments received").fill("2000");
  await page.getByLabel("Advances received").fill("0");
}

test("earnings page: not signed in shows device-only note and consent", async ({ page }) => {
  await page.goto("/earnings");
  await expect(page.getByText(/You are not signed in\. Entries stay only on this device/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Keep entries on this phone/ })).not.toBeChecked();
});

test("daily-wage entry with device consent persists across reload, balance correct", async ({ page }) => {
  await page.goto("/earnings");
  await page.getByRole("checkbox", { name: /Keep entries on this phone/ }).check();
  await fillDaily(page);
  await page.getByRole("button", { name: "Add an entry" }).click();
  await expect(page.locator("li", { hasText: "Saved on this device" })).toHaveCount(1);
  const summary = page.locator("dl.tabular").first();
  await expect(summary).toContainText("₹5,600");
  await expect(summary).toContainText("₹2,000");
  await expect(summary).toContainText("₹3,600");
  await page.reload();
  await page.getByRole("button", { name: "Daily wage" }).click();
  await expect(page.locator("li", { hasText: "Saved on this device" })).toHaveCount(1);
  await expect(page.locator("dl.tabular").first()).toContainText("₹3,600");
});

test("without consent, entry is kept in memory only and gone after reload", async ({ page }) => {
  await page.goto("/earnings");
  await fillDaily(page);
  await page.getByRole("button", { name: "Add an entry" }).click();
  await expect(page.locator("li", { hasText: "Saved on this device" })).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Daily wage" }).click();
  await expect(page.getByText("No entries yet.")).toBeVisible();
});

test("offline: entry added while offline is saved on device, no duplicate after reconnect/reload", async ({ page, context }) => {
  await page.goto("/earnings");
  await page.getByRole("checkbox", { name: /Keep entries on this phone/ }).check();
  await page.getByRole("button", { name: "Daily wage" }).click();
  await context.setOffline(true);
  await fillDaily(page);
  await page.getByRole("button", { name: "Add an entry" }).click();
  await expect(page.locator("li", { hasText: "Saved on this device" })).toHaveCount(1);
  await context.setOffline(false);
  await page.waitForTimeout(500);
  await expect(page.locator("li", { hasText: "Saved on this device" })).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Daily wage" }).click();
  await expect(page.locator("li", { hasText: "Saved on this device" })).toHaveCount(1);
});

test("invalid money in an entry is announced with aria-invalid", async ({ page }) => {
  await page.goto("/earnings");
  await page.getByRole("button", { name: "Daily wage" }).click();
  await page.getByLabel("Pay per day").fill("abc");
  await page.getByRole("button", { name: "Add an entry" }).click();
  await expect(page.getByLabel("Pay per day")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Pay per day")).toBeFocused();
});

test.skip("signed-in earnings offline queue sync", async () => {
  // Skipped: requires real Supabase authentication; no credentials are configured.
});
