import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Public surface acceptance (CP4): routing (EN-at-root 308 + alias 301, query preserved),
 * canonical/hreflang, the browse→category→listing journey + directions, JSON-LD presence,
 * and axe on home/category/listing. Runs against the seed (listing A ramen, B sushi).
 */

const JA_ALIAS = "/ja/spot/aloha-ramen-hale"; // romanized alias
const JA_CANONICAL_ENC = "/ja/spot/%E3%82%A2%E3%83%AD%E3%83%8F%E3%83%A9%E3%83%BC%E3%83%A1%E3%83%B3%E3%83%8F%E3%83%AC";

test.describe("routing", () => {
  test("anon GET / renders (200), not a login redirect", async ({ request }) => {
    const res = await request.get("/", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test("/en/* → 308 to the de-prefixed path, query preserved", async ({ request }) => {
    // Location may be relative or absolute — resolve against a dummy base for both.
    const home = await request.get("/en", { maxRedirects: 0 });
    expect(home.status()).toBe(308);
    expect(new URL(home.headers()["location"]!, "http://b").pathname).toBe("/");

    const cat = await request.get("/en/ramen?x=1", { maxRedirects: 0 });
    expect(cat.status()).toBe(308);
    const loc = new URL(cat.headers()["location"]!, "http://b");
    expect(loc.pathname).toBe("/ramen");
    expect(loc.search).toBe("?x=1");
  });

  test("romanized JA alias → permanent redirect to the native-script canonical (single hop)", async ({ request }) => {
    const res = await request.get(JA_ALIAS, { maxRedirects: 0 });
    expect([301, 308]).toContain(res.status());
    expect(res.headers()["location"]).toContain(JA_CANONICAL_ENC);
  });

  test("draft / KO / unknown all 404", async ({ request }) => {
    expect((await request.get("/spot/kona-coffee-corner", { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get("/ko", { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get("/cafes-coffee", { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get("/activities", { maxRedirects: 0 })).status()).toBe(404);
  });
});

test.describe("canonical + hreflang", () => {
  test("listing emits a locale canonical (no /en) + en/ja/x-default hreflang", async ({ request }) => {
    const html = await (await request.get("/spot/aloha-ramen-hale")).text();
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(canonical).toBeTruthy();
    expect(canonical).toContain("/spot/aloha-ramen-hale");
    expect(canonical).not.toContain("/en/");
    expect(html).toContain('hrefLang="en"');
    expect(html).toContain('hrefLang="ja"');
    expect(html).toContain('hrefLang="x-default"');
  });
});

test.describe("journey + structured data + a11y", () => {
  test("browse → category → listing, with directions + JSON-LD, axe-clean at each step", async ({ page }) => {
    // Home
    await page.goto("/");
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on home").toEqual([]);
    await page.getByRole("link", { name: /Ramen/ }).first().click();

    // Category
    await expect(page).toHaveURL(/\/ramen$/);
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on category").toEqual([]);
    await page.getByRole("link", { name: /Aloha Ramen Hale/ }).first().click();

    // Listing
    await expect(page).toHaveURL(/\/spot\/aloha-ramen-hale$/);
    await expect(page.getByRole("heading", { level: 1, name: "Aloha Ramen Hale" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Directions/ })).toHaveAttribute("href", /google\.com\/maps/);
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on listing").toEqual([]);
    // JSON-LD Restaurant present
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(ld).toContain('"@type":"Restaurant"');
  });

  test("language switcher navigates to the JA listing", async ({ page }) => {
    await page.goto("/spot/aloha-ramen-hale");
    await page.getByRole("link", { name: "日本語" }).click();
    await expect(page).toHaveURL(/\/ja\/spot\//);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  });
});
