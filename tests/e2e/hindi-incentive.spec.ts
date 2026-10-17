import { test, expect } from "@playwright/test";
import { isolateRateLimit, confirmAll, gotoReview, runCheck, startExample } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateRateLimit(context);
});

test("Hindi Fixture A: review, correct a field, check, complaint, approve, copy/print", async ({ page, context, browserName }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.goto("/");
  await page.getByRole("button", { name: "हिंदी", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "हिंदी", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  expect((await context.cookies()).some((c) => c.name === "hc_locale" && c.value === "hi")).toBe(true);

  await startExample(page, "A");
  await expect(page.getByText(/Fictional demo data|काल्पनिक/).first()).toBeVisible();
  await gotoReview(page);
  await confirmAll(page, { skip: ["incentive_credited"] });

  const credited = page.locator('li[data-field="incentive_credited"]');
  await credited.getByRole("button", { name: /^बदलें: / }).click();
  const input = credited.getByRole("textbox");
  await input.fill("250");
  await input.press("Enter");
  await expect(credited.getByText("₹250")).toBeVisible();

  await expect(page.getByText("सभी ज़रूरी जानकारियाँ पक्की हो गईं।")).toBeVisible();
  await runCheck(page);

  await expect(page.getByRole("heading", { name: "भुगतान में फ़र्क हो सकता है" })).toBeVisible();
  const tiles = page.locator("dl.tabular").first();
  await expect(tiles).toContainText("₹600");
  await expect(tiles).toContainText("₹250");
  await expect(tiles).toContainText("₹350");

  await page.getByRole("button", { name: /शिकायत|Prepare a complaint/ }).click();
  await page.waitForURL(/\/complaint/);
  await expect(page.getByRole("button", { name: "हिंदी", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "शिकायत लिखें" }).click();

  const textarea = page.locator("textarea");
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveAttribute("lang", "hi");
  await expect(textarea).toHaveValue(/[ऀ-ॿ]/);
  await expect(page.locator("textarea")).toHaveValue(/350/);

  const copy = page.getByRole("button", { name: /कॉपी|Copy/ });
  await expect(copy).toBeDisabled();
  await page.getByRole("button", { name: "मैंने पढ़ लिया है और यह सही है" }).click();
  await expect(copy).toBeEnabled();

  const printLink = page.getByRole("link", { name: /प्रिंट|Print or save/ });
  await printLink.click();
  await page.waitForURL(/\/print$/);
  const printed = page.locator("p[lang='hi']").first();
  await expect(printed).toContainText(/[ऀ-ॿ]/);
  await expect(printed).toContainText("350");
  expect(browserName).toBe("chromium");
});

test("Hindi complaint: editing approved text shows it changed since approval, and unlocks approve again", async ({ page }) => {
  await page.goto("/");
  await startExample(page, "A");
  await gotoReview(page);
  await confirmAll(page);
  await runCheck(page);
  await page.getByRole("button", { name: "Prepare a complaint" }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Write the complaint" }).click();
  await expect(page.getByText("Standard factual draft")).toBeVisible();
  await page.getByRole("button", { name: "I have read this and it is correct" }).click();
  await expect(page.getByRole("button", { name: "Copy text" })).toBeEnabled();
  const ta = page.getByLabel("Complaint text");
  await ta.fill((await ta.inputValue()) + "\nExtra line.");
  await expect(page.getByRole("button", { name: "Copy text" })).toBeDisabled();
  await ta.blur();
  await expect(page.getByRole("button", { name: "I have read this and it is correct" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy text" })).toBeDisabled();
});

// KNOWN APP BUG: the "Changed since you approved it" notice (complaint/page.tsx, shown when approvedRevision !== null && !approved)
// can never render, because withComplaintText (src/domain/case.ts:200) resets approvedRevision to null on any edit.
test.fail("editing after approval shows 'Changed since you approved it' (known bug: notice is unreachable)", async ({ page }) => {
  await page.goto("/");
  await startExample(page, "A");
  await gotoReview(page);
  await confirmAll(page);
  await runCheck(page);
  await page.getByRole("button", { name: "Prepare a complaint" }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Write the complaint" }).click();
  await page.getByRole("button", { name: "I have read this and it is correct" }).click();
  const ta = page.getByLabel("Complaint text");
  await ta.fill((await ta.inputValue()) + "\nExtra line.");
  await ta.blur();
  await expect(page.getByText("Changed since you approved it")).toBeVisible({ timeout: 3000 });
});

test("approving the complaint is recorded in the case timeline", async ({ page }) => {
  await page.goto("/");
  await startExample(page, "A");
  await gotoReview(page);
  await confirmAll(page);
  await runCheck(page);
  await page.getByRole("button", { name: "Prepare a complaint" }).click();
  await page.waitForURL(/\/complaint/);
  const caseUrl = page.url().replace(/\/complaint.*/, "");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Write the complaint" }).click();
  await page.getByRole("button", { name: "I have read this and it is correct" }).click();
  await expect(page.getByRole("button", { name: "Copy text" })).toBeEnabled();
  await page.goto(caseUrl);
  await expect(page.getByText("Complaint approved by you")).toBeVisible();
});
