import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInWithMfa } from "./support/auth";
import { newPg, readState } from "./support/state";

test("super-admin reviews and safely updates the Phase 0 configuration registry", async ({ page }) => {
  const pg = newPg();
  const [original] = await pg<{ value: number }[]>`
    select value from app_config where key = 'report_delivery_day'`;
  const originalValue = Number(original!.value);
  const nextValue = originalValue === 28 ? 27 : originalValue + 1;

  try {
    const { publisher } = readState();
    await signInWithMfa(page, publisher);
    await page.goto("/admin");
    await page.getByRole("link", { name: /configuration review operational policy/i }).click();

    await expect(page.getByRole("heading", { name: "Configuration registry", exact: true })).toBeVisible();
    await expect(page.getByText("Super-admin editing enabled")).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: "report_delivery_day" });
    const input = card.getByLabel("JSON value");
    await expect(input).toHaveValue(String(originalValue));
    await input.fill(String(nextValue));
    await card.getByRole("button", { name: "Validate and save" }).click();
    await expect(card.getByRole("status")).toHaveText(/setting saved/i);

    const [updated] = await pg<{ value: number; updated_by: string }[]>`
      select value, updated_by from app_config where key = 'report_delivery_day'`;
    expect(Number(updated!.value)).toBe(nextValue);
    expect(updated!.updated_by).toBe(publisher.userId);

    await input.fill("31");
    await card.getByRole("button", { name: "Validate and save" }).click();
    await expect(card.getByRole("alert")).toHaveText(/does not match the registry schema/i);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Configuration registry", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on mobile configuration registry").toEqual([]);
  } finally {
    await pg`update app_config set value = ${originalValue}::jsonb, updated_by = null where key = 'report_delivery_day'`;
    await pg.end();
  }
});
test("non-super-admin staff can inspect configuration but cannot edit it", async ({ page }) => {
  const { editor } = readState();
  await signInWithMfa(page, editor);
  await page.goto("/admin/config");
  await expect(page.getByRole("heading", { name: "Configuration registry", exact: true })).toBeVisible();
  await expect(page.getByText("Read-only registry access")).toBeVisible();
  await expect(page.getByText("Current JSON value").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Validate and save" })).toHaveCount(0);
});
