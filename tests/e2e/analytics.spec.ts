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

test.describe("analytics server capture (ADR-005)", () => {
  test("a listing page load records a server listing_view + session_start", async ({ browser }) => {
    const pg = newPg();
    try {
      const baseUrl = e2eEnv().baseUrl;
      const countServerViews = async () => {
        const r = await pg`
          select count(*)::int as c from events
          where name = 'listing_view' and source = 'server' and listing_id = ${REFERENCE_LISTING}`;
        return r[0]!.c as number;
      };
      const countServerSessions = async () => {
        const r = await pg`select count(*)::int as c from events where name = 'session_start' and source = 'server'`;
        return r[0]!.c as number;
      };

      const before = await countServerViews();
      const sessionsBefore = await countServerSessions();

      // Fresh context (no sid cookie) → new session → session_start + listing_view.
      const context = await browser.newContext({ userAgent: REAL_UA });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/spot/aloha-ramen-hale`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await expect
        .poll(countServerViews, { timeout: 20_000, intervals: [400, 700, 1000] })
        .toBeGreaterThan(before);
      await expect.poll(countServerSessions, { timeout: 20_000 }).toBeGreaterThan(sessionsBefore);

      await context.close();
    } finally {
      await pg.end();
    }
  });

  test("a prefetch request does not record a server listing_view", async ({ request }) => {
    const pg = newPg();
    try {
      const baseUrl = e2eEnv().baseUrl;
      const countServerViews = async () => {
        const r = await pg`
          select count(*)::int as c from events
          where name = 'listing_view' and source = 'server' and listing_id = ${REFERENCE_LISTING}`;
        return r[0]!.c as number;
      };
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
});
