import { test, expect } from "@playwright/test";
import { gotoReview, startExample } from "./helpers";

test("keyboard: Change opens editor, Escape closes it and returns focus; error linked via aria-describedby", async ({ page }) => {
  await startExample(page, "A");
  await gotoReview(page);
  const row = page.locator('li[data-field="incentive_credited"]');
  const change = row.getByRole("button", { name: "Change: Incentive credited" }).or(row.getByRole("button", { name: /^Change: / }));
  await change.focus();
  await page.keyboard.press("Enter");
  const input = row.getByRole("textbox");
  await expect(input).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(row.getByRole("button", { name: /^Change: / })).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(input).toBeFocused();
  await input.fill("12abc");
  await page.keyboard.press("Enter");
  const msg = "Enter an amount like 600 or 1,200.50";
  await expect(row.getByText(msg)).toBeVisible();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  const describedBy = await input.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  const texts = await page.evaluate((ids) => ids.split(" ").map((id) => document.getElementById(id)?.textContent ?? ""), describedBy!);
  expect(texts.join(" ")).toContain(msg);

  await input.fill("250");
  await page.keyboard.press("Enter");
  await expect(row.getByText("₹250")).toBeVisible();
  await expect(row.getByRole("button", { name: /^Change: / })).toBeFocused();
});
