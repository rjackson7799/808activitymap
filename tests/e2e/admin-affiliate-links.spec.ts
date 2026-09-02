import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInWithMfa } from "./support/auth";
import { LISTING } from "../db/fixtures";
import { newPg, readState } from "./support/state";

const PARTNER_KEY = "e2e-activity-partner";

test("publisher adds, measures, and hides a disclosed affiliate link", async ({ page }) => {
  const pg = newPg();
  try {
    await pg`delete from affiliate_links where partner_key=${PARTNER_KEY}`;
    const { publisher } = readState();
    await signInWithMfa(page, publisher);
    await page.goto("/admin/deals");

    const form = page.getByRole("form", { name: "Add tracked affiliate link" });
    await form.getByLabel("Listing").selectOption(LISTING.ramen);
    await form.getByLabel("Partner key").fill(PARTNER_KEY);
    await form.getByLabel("Partner display name").fill("Demo Activity Partner");
    await form.getByLabel("Tracked destination URL").fill("https://example.com/activity?ref=808");
    await form.getByLabel("Context").selectOption("nearby_activity");
    await form.getByLabel("Sort order").fill("10");
    await form.getByRole("button", { name: "Add tracked link" }).click();

    const card = page.getByRole("article").filter({ hasText: "Demo Activity Partner" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Active", { exact: true })).toBeVisible();

    const publicResponse = await page.goto("/spot/aloha-ramen-hale");
    const serverHtml = await publicResponse!.text();
    expect(serverHtml).toContain("Demo Activity Partner");
    expect(serverHtml).toContain("Affiliate link. We may earn a commission");
    await expect(page.getByRole("heading", { name: "Explore nearby" })).toBeVisible();
    const link = page.getByRole("link", { name: "Explore with Demo Activity Partner" });
    await expect(link).toHaveAttribute("rel", "sponsored");
    const href = await link.getAttribute("href");
    const redirect = await page.request.get(href!, {
      maxRedirects: 0,
      headers: { "user-agent": "Mozilla/5.0 Chrome/140 Safari/537.36" },
    });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers().location).toBe("https://example.com/activity?ref=808");
    await expect.poll(async () => Number((await pg`
      select count(*) from events
      where name='affiliate_clickout' and props->>'partner'=${PARTNER_KEY}
    `)[0]!.count)).toBe(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(link).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const jaResponse = await page.goto("/ja/spot/アロハラーメンハレ");
    expect(await jaResponse!.text()).toContain("周辺の体験を探す");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.getByRole("link", { name: "Demo Activity Partnerで見る" })).toBeVisible();
    await expect(page.getByText(/アフィリエイトリンクです/)).toBeVisible();

    await page.goto("/admin/deals");
    const adminCard = page.getByRole("article").filter({ hasText: "Demo Activity Partner" });
    await adminCard.getByRole("button", { name: "Hide link" }).click();
    await expect(adminCard.getByText("Hidden", { exact: true })).toBeVisible();
    await page.goto("/spot/aloha-ramen-hale");
    await expect(page.getByRole("link", { name: "Explore with Demo Activity Partner" })).toHaveCount(0);
    expect((await page.request.get(href!, { maxRedirects: 0 })).status()).toBe(404);
  } finally {
    await pg`delete from events where name='affiliate_clickout' and props->>'partner'=${PARTNER_KEY}`;
    await pg`delete from affiliate_links where partner_key=${PARTNER_KEY}`;
    await pg.end();
  }
});
