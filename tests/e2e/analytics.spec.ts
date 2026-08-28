import { test, expect } from "@playwright/test";
import { newPg } from "./support/state";
import { e2eEnv } from "./support/env";

/**
 * CP5 analytics — implemented events land in `events` per their declared
 * capture path (DoD #7). Server capture (listing_view + session_start) is
 * asserted here; client emitters are asserted in the JS-on assertions below.
 * Observation is by polling the DB (no fixed sleeps).
 *
 * A clean, explicit UA is set so the bot filter (which drops "headless"/
 * "lighthouse"/"bot" UAs) never eats these events regardless of how Chromium
 * reports itself.
 */

const REFERENCE_LISTING = "c0000000-0000-4000-8000-000000000001";
const REAL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function eventCount(
  pg: ReturnType<typeof newPg>,
  name: string,
  source: "client" | "server",
  listingId: string | null = null,
): Promise<number> {
  const rows = listingId
    ? await pg`select count(*)::int as c from events
               where name = ${name} and source = ${source} and listing_id = ${listingId}`
    : await pg`select count(*)::int as c from events
               where name = ${name} and source = ${source}`;
  return rows[0]!.c as number;
}

test.describe("analytics server capture (ADR-005)", () => {
  test("a listing page load records a server listing_view + session_start", async ({ browser }) => {
    const pg = newPg();
    try {
      const baseUrl = e2eEnv().baseUrl;
      const countServerViews = () => eventCount(pg, "listing_view", "server", REFERENCE_LISTING);
      const countClientViews = () => eventCount(pg, "listing_view", "client", REFERENCE_LISTING);
      const countServerSessions = async () => {
        const r = await pg`select count(*)::int as c from events where name = 'session_start' and source = 'server'`;
        return r[0]!.c as number;
      };

      const before = await countServerViews();
      const clientBefore = await countClientViews();
      const sessionsBefore = await countServerSessions();

      // Fresh context (no sid cookie) → new session → session_start + listing_view.
      const context = await browser.newContext({ userAgent: REAL_UA });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/spot/aloha-ramen-hale`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await expect
        .poll(countServerViews, { timeout: 20_000, intervals: [400, 700, 1000] })
        .toBe(before + 1);
      await expect.poll(countServerSessions, { timeout: 20_000 }).toBeGreaterThan(sessionsBefore);
      // Hydration must not create a corroborating duplicate.
      await expect.poll(countClientViews, { timeout: 2_000 }).toBe(clientBefore);

      await context.close();
    } finally {
      await pg.end();
    }
  });

  test("a prefetch request does not record a server listing_view", async ({ request }) => {
    const pg = newPg();
    try {
      const baseUrl = e2eEnv().baseUrl;
      const countServerViews = () => eventCount(pg, "listing_view", "server", REFERENCE_LISTING);
      const before = await countServerViews();

      // A Next router prefetch of the listing page — must be skipped (ADR-005).
      await request.get(`${baseUrl}/spot/aloha-ramen-hale`, {
        headers: { "next-router-prefetch": "1", "user-agent": REAL_UA, accept: "*/*" },
      });

      // Give any (erroneous) capture a chance to land, then assert it did NOT.
      await expect.poll(countServerViews, { timeout: 3_000 }).toBe(before);
    } finally {
      await pg.end();
    }
  });

  test("a malformed percent-encoded listing slug returns not-found, not a proxy error", async ({ request }) => {
    const response = await request.get(`${e2eEnv().baseUrl}/spot/%E0%A4%A`);
    expect(response.status()).toBe(404);
  });

  test("a transport-escaped malformed listing slug returns not-found, not a server error", async ({ request }) => {
    const response = await request.get(`${e2eEnv().baseUrl}/spot/%25E0%25A4%25A`);
    expect(response.status()).toBe(404);
  });
});

test.describe("analytics client controls", () => {
  test("client-side navigation records one client listing_view and no server duplicate", async ({ browser }) => {
    const pg = newPg();
    const context = await browser.newContext({ userAgent: REAL_UA });
    try {
      const page = await context.newPage();
      const serverBefore = await eventCount(pg, "listing_view", "server", REFERENCE_LISTING);
      const clientBefore = await eventCount(pg, "listing_view", "client", REFERENCE_LISTING);

      await page.goto(`${e2eEnv().baseUrl}/ramen`);
      await page.getByRole("link", { name: /Aloha Ramen Hale/ }).click();
      await expect(page).toHaveURL(/\/spot\/aloha-ramen-hale$/);

      await expect
        .poll(() => eventCount(pg, "listing_view", "client", REFERENCE_LISTING), { timeout: 20_000 })
        .toBe(clientBefore + 1);
      await expect
        .poll(() => eventCount(pg, "listing_view", "server", REFERENCE_LISTING), { timeout: 2_000 })
        .toBe(serverBefore);
    } finally {
      await context.close();
      await pg.end();
    }
  });

  test("directions click records the real Google Maps control", async ({ browser }) => {
    const pg = newPg();
    const context = await browser.newContext({ userAgent: REAL_UA });
    try {
      const page = await context.newPage();
      await page.goto(`${e2eEnv().baseUrl}/spot/aloha-ramen-hale`);
      const before = await eventCount(pg, "direction_click", "client", REFERENCE_LISTING);
      const directions = page.getByRole("link", { name: "Directions" });
      await directions.evaluate((link) => link.addEventListener("click", (event) => event.preventDefault()));
      await directions.click();
      await expect
        .poll(() => eventCount(pg, "direction_click", "client", REFERENCE_LISTING), { timeout: 20_000 })
        .toBe(before + 1);
    } finally {
      await context.close();
      await pg.end();
    }
  });

  test("language switch records from and to locales", async ({ browser }) => {
    const pg = newPg();
    const context = await browser.newContext({ userAgent: REAL_UA });
    try {
      const page = await context.newPage();
      await page.goto(`${e2eEnv().baseUrl}/spot/aloha-ramen-hale`);
      const beforeRows = await pg`select count(*)::int as c from events
        where name = 'language_switch' and source = 'client'
          and props->>'from' = 'en' and props->>'to' = 'ja'`;
      const before = beforeRows[0]!.c as number;
      await page.getByRole("link", { name: "日本語" }).click();
      await expect(page).toHaveURL(/\/ja\/spot\//);
      await expect.poll(async () => {
        const rows = await pg`select count(*)::int as c from events
          where name = 'language_switch' and source = 'client'
            and props->>'from' = 'en' and props->>'to' = 'ja'`;
        return rows[0]!.c as number;
      }, { timeout: 20_000 }).toBe(before + 1);
    } finally {
      await context.close();
      await pg.end();
    }
  });

  test("menu section visible for one second records menu_view", async ({ browser }) => {
    const pg = newPg();
    const context = await browser.newContext({ userAgent: REAL_UA });
    try {
      const page = await context.newPage();
      await page.goto(`${e2eEnv().baseUrl}/spot/aloha-ramen-hale`);
      const before = await eventCount(pg, "menu_view", "client", REFERENCE_LISTING);
      await page.locator("[data-analytics='menu-section']").first().scrollIntoViewIfNeeded();
      await expect
        .poll(() => eventCount(pg, "menu_view", "client", REFERENCE_LISTING), { timeout: 20_000 })
        .toBeGreaterThan(before);
    } finally {
      await context.close();
      await pg.end();
    }
  });

  test("share copy reports success only after clipboard write resolves", async ({ browser }) => {
    const pg = newPg();
    const context = await browser.newContext({ userAgent: REAL_UA });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: async (value: string) => { (window as unknown as { copiedValue: string }).copiedValue = value; } },
        configurable: true,
      });
    });
    try {
      const page = await context.newPage();
      await page.goto(`${e2eEnv().baseUrl}/spot/aloha-ramen-hale`);
      const before = await eventCount(pg, "share_click", "client", REFERENCE_LISTING);
      await page.getByRole("button", { name: "Share" }).click();
      await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as unknown as { copiedValue: string }).copiedValue))
        .toContain("/spot/aloha-ramen-hale");
      await expect
        .poll(() => eventCount(pg, "share_click", "client", REFERENCE_LISTING), { timeout: 20_000 })
        .toBe(before + 1);
    } finally {
      await context.close();
      await pg.end();
    }
  });

  test("share does not report success when no clipboard operation exists", async ({ browser }) => {
    const pg = newPg();
    const context = await browser.newContext({ userAgent: REAL_UA });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    });
    try {
      const page = await context.newPage();
      await page.goto(`${e2eEnv().baseUrl}/spot/aloha-ramen-hale`);
      const before = await eventCount(pg, "share_click", "client", REFERENCE_LISTING);
      await page.getByRole("button", { name: "Share" }).click();
      await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Link copied" })).toHaveCount(0);
      await expect
        .poll(() => eventCount(pg, "share_click", "client", REFERENCE_LISTING), { timeout: 2_000 })
        .toBe(before);
    } finally {
      await context.close();
      await pg.end();
    }
  });
});
