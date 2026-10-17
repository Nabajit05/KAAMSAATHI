import { test, expect } from "@playwright/test";

test("welcome page, language buttons and header toggle persist locale", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Try an example/ }).or(page.getByRole("button", { name: /Try an example/ }))).toBeVisible();
  await expect(page.getByRole("button", { name: "English", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await page.goto("/demo");
  await page.getByRole("button", { name: "हिंदी में देखें" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  expect((await context.cookies()).find((c) => c.name === "hc_locale")?.value).toBe("hi");
  await page.getByRole("button", { name: "View in English" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("help page: emergency link and sections", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("link", { name: "Call 112" })).toHaveAttribute("href", "tel:112");
  for (const h of ["Payment and complaint help", "Safety", "Welfare and documents"]) {
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  }
  const first = page.locator("details").first();
  await first.locator("summary").click();
  await expect(first).toContainText(/Reviewed/);
  expect(await page.locator("details").count()).toBeGreaterThanOrEqual(3);
  for (const d of await page.locator("details").all()) await expect(d).toContainText(/Reviewed/);
});

test("sign-in explains it is not set up", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("Sign-in is not set up yet")).toBeVisible();
});

test.skip("login with real auth and private case save/reload", async () => {
  // Skipped: no Supabase credentials exist in this environment, so real sign-in and private case persistence cannot run.
});

test("demo evidence page: live AI sample reading is honestly unavailable", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Incentive paid less/ }).click();
  await page.waitForURL(/\/evidence/);
  await page.getByRole("button", { name: "Read the sample live with AI" }).click();
  await expect(page.getByText(/Live reading is not set up/)).toBeVisible();
});
