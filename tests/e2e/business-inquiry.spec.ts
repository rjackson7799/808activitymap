import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Phase 0 for-business inquiry", () => {
  test("EN page is discoverable, accessible, mobile-safe, and stores an inquiry", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("link", { name: "For businesses" }).click();

    await expect(page).toHaveURL(/\/for-business$/);
    await expect(page.getByRole("heading", { level: 1, name: /accurate information/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on English for-business page").toEqual([]);

    await page.getByLabel(/Business name/).fill("Island Noodle House");
    await page.getByLabel(/Your name/).fill("Kai Example");
    await page.getByLabel(/^Email/).fill("kai@example.com");
    await page.getByLabel(/What would you like help with/).fill("I would like help publishing accurate information about our business.");
    await page.getByLabel(/I agree that the team/).check();
    const submission = page.waitForResponse((response) => response.url().endsWith("/api/business-inquiries"));
    await page.getByRole("button", { name: "Send inquiry" }).click();
    const response = await submission;
    expect(response.status(), await response.text()).toBe(201);
    await expect(page.getByRole("status")).toContainText("Reference:");
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe after English inquiry").toEqual([]);
  });

  test("JA page uses localized copy, canonical alternates, and Japanese typography", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ja/for-business");

    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.getByRole("heading", { level: 1, name: /正確な店舗・事業情報/ })).toBeVisible();
    await expect(page.getByLabel("ご希望の言語")).toHaveValue("ja");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("h1")!).fontFamily)).toContain("Noto Sans JP");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on Japanese for-business page").toEqual([]);

    await expect(page.locator('head link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/for-business$/);
    await expect(page.locator('head link[rel="alternate"][hreflang="ja"]')).toHaveAttribute("href", /\/ja\/for-business$/);
    await expect(page.locator('head link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/for-business$/);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/for-business");
    await expect(page.getByRole("heading", { level: 2, name: "Start a conversation" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("does not expose the Phase 1 business surface in Korean", async ({ request }) => {
    expect((await request.get("/ko/for-business", { maxRedirects: 0 })).status()).toBe(404);
  });
});
