import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInWithMfa } from "./support/auth";
import { readState, newPg } from "./support/state";

test("editor securely reviews and updates a business inquiry on desktop and mobile", async ({ page }) => {
  const pg = newPg();
  let inquiryId = "";
  try {
    const [row] = await pg<{ id: string }[]>`
      insert into public.business_inquiries
        (market_id, source_locale, business_name, contact_name, email, phone, website, message, preferred_language)
      values
        ('oahu-waikiki', 'ja', 'Aloha Inquiry E2E', 'Mika Example', 'mika@example.com', '+1 808 555 0142',
         'https://example.com', 'Please contact me in Japanese about keeping our information accurate.', 'ja')
      returning id`;
    inquiryId = row!.id;

    const { editor } = readState();
    await signInWithMfa(page, editor);
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /business inquiries follow up/i })).toBeVisible();
    await page.getByRole("link", { name: /business inquiries follow up/i }).click();

    await expect(page.getByRole("heading", { name: "Business inquiries", exact: true })).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: "Aloha Inquiry E2E" });
    await expect(card.getByText("mika@example.com")).toBeVisible();
    await expect(card.getByText("Preferred language: Japanese")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on inquiry queue").toEqual([]);

    await card.getByLabel("New status").selectOption("contacted");
    await card.getByLabel("Internal note").fill("Sent a Japanese-language introduction by email.");
    await card.getByRole("button", { name: "Save status" }).click();
    await expect(card.getByText("Contacted", { exact: true })).toBeVisible();
    await expect(card.getByText("Sent a Japanese-language introduction by email.")).toBeVisible();

    const [updated] = await pg<{ status: string; handled_by: string; staff_note: string }[]>`
      select status, handled_by, staff_note from public.business_inquiries where id = ${inquiryId}`;
    expect(updated).toMatchObject({
      status: "contacted",
      handled_by: editor.userId,
      staff_note: "Sent a Japanese-language introduction by email.",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on mobile inquiry queue").toEqual([]);
  } finally {
    if (inquiryId) await pg`delete from public.business_inquiries where id = ${inquiryId}`;
    await pg.end();
  }
});

test("language reviewer does not see the operations-only inquiry workspace", async ({ page }) => {
  const { reviewerJa } = readState();
  await signInWithMfa(page, reviewerJa);
  await page.goto("/admin");
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Inquiries" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /business inquiries follow up/i })).toHaveCount(0);
  await page.goto("/admin/business-inquiries");
  await expect(page).toHaveURL(/\/admin$/);
});
