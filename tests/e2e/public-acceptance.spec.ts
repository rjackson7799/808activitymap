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

  test("discovery endpoints expose the canonical sitemap and branded llms.txt", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    // The E2E server is intentionally non-production and must remain unindexable.
    expect(await robots.text()).toContain("Disallow: /");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const sitemapXml = await sitemap.text();
    expect(sitemapXml).toContain("/spot/aloha-ramen-hale");
    expect(sitemapXml).toContain("/ja/spot/");
    expect(sitemapXml).not.toContain("/ko/");

    const llms = await request.get("/llms.txt");
    expect(llms.status()).toBe(200);
    expect(llms.headers()["content-type"]).toContain("text/plain");
    const llmsText = await llms.text();
    expect(llmsText).toContain(`# ${process.env.BRAND_NAME}`);
    expect(llmsText).toContain("/trust");
    expect(llmsText).toContain("/sitemap.xml");
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
    const categoryLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(categoryLd.some((node) => node.includes('"@type":"ItemList"'))).toBe(true);
    expect(categoryLd.some((node) => node.includes('"@type":"BreadcrumbList"'))).toBe(true);
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
    await page.locator('summary[aria-label="Language"]').click();
    await page.getByRole("link", { name: "日本語" }).click();
    await expect(page).toHaveURL(/\/ja\/spot\//);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  });

  test("public layouts fit mobile and Japanese uses its locale type family", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const languageControl = page.locator('summary[aria-label="Language"]');
    const controlBox = await languageControl.boundingBox();
    expect(controlBox?.height).toBeGreaterThanOrEqual(36);

    await languageControl.click();
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe with language menu open").toEqual([]);
    await page.getByRole("link", { name: "日本語" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("h1")!).fontFamily)).toContain("Noto Sans JP");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/spot/aloha-ramen-hale");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("link", { name: "Directions" }).first()).toBeVisible();
  });

  test("trust and correction flow is localized, mobile-safe, accessible, and stores a report", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/trust");
    await expect(page.getByRole("heading", { level: 1, name: /keep information trustworthy/i })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on trust page").toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.goto("/spot/aloha-ramen-hale");
    await page.getByRole("link", { name: "Report a change" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Report a change" })).toBeVisible();
    await page.getByLabel("What needs updating?").selectOption("hours");
    await page.getByLabel("What should we know?").fill("The weekday closing time is now 8 p.m.; staff confirmed this today.");
    await page.getByLabel("Email (optional)").fill("visitor@example.com");
    const submission = page.waitForResponse((response) => response.url().endsWith("/api/change-requests"));
    await page.getByRole("button", { name: "Send report" }).click();
    const submissionResponse = await submission;
    expect(submissionResponse.status(), await submissionResponse.text()).toBe(201);
    await expect(page.getByRole("status")).toContainText("review queue");
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe after correction submission").toEqual([]);

    await page.goto("/ja/trust");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.getByRole("heading", { level: 1, name: "正確な情報を保つために" })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("h1")!).fontFamily)).toContain("Noto Sans JP");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
