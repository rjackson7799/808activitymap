import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * BLOCKING negative public-leakage suite (CP4 exit criterion). The public surface reads
 * through the service-role client (RLS bypassed), so this is the last line of defense: it
 * fetches every rendered public page + the sitemap and asserts NONE of the seed canaries
 * appear, and that draft / KO / hidden / secondary-only routes 404. Complements the
 * DTO-layer leakage checks in tests/db/public-read.test.ts (canaries through each query fn).
 */

// Every public page in the seed (native-script paths are followed through the 308 → encoded).
const PUBLIC_PAGES = [
  "/",
  "/ja",
  "/ramen",
  "/ja/ラーメン",
  "/spot/aloha-ramen-hale",
  "/ja/spot/アロハラーメンハレ",
  "/spot/waikiki-sushi-ten",
  "/ja/spot/ワイキキ寿司天",
];

// Substrings that must NEVER appear on any public surface.
const CANARIES = [
  "MACHINE_DRAFT_TEXT_MUST_NOT_RENDER", // C/ja machine_draft seo_desc
  "機械翻訳ドラフト", // C/ja machine_draft name
  "Kona Coffee Corner", // draft C EN name
  "kona-coffee-corner", // draft C slug (must not appear as a link)
  "알로하", // A/ko name (KO never serves)
  "aloha-approval", // evidence path
  "aloha-ramen-menu.pdf", // menu-source path
  "SEED-AGR-001", // rights ref
  "vendor_agreement_v1", // rights license
  "Aloha Ramen Hale LLC", // org legal_name (the display NAME "Aloha Ramen Hale" is fine)
  "onboarding_form", // provenance source_type
  "hours_confirmation",
  "in_person_visit",
];

async function bodyOf(request: APIRequestContext, path: string): Promise<string> {
  const res = await request.get(path);
  expect(res.status(), `expected 200 for ${path}`).toBe(200);
  return res.text();
}

test.describe("no forbidden content on any public page", () => {
  for (const path of PUBLIC_PAGES) {
    test(`page ${path} leaks no canary`, async ({ request }) => {
      const html = await bodyOf(request, path);
      for (const canary of CANARIES) {
        expect(html, `${path} leaked "${canary}"`).not.toContain(canary);
      }
    });
  }

  test("sitemap leaks nothing: no draft/hidden/secondary categories, no KO, no aliases, no canaries", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const forbidden of ["/ko", "/ja/spot/aloha-ramen-hale", "cafes-coffee", "izakaya", "activities", "surf-lessons", "kona-coffee", ...CANARIES]) {
      expect(sitemap, `sitemap leaked "${forbidden}"`).not.toContain(forbidden);
    }
  });
});

test.describe("forbidden routes 404 (never serve draft/KO/hidden/secondary)", () => {
  const NOT_FOUND = [
    "/spot/kona-coffee-corner", // draft C
    "/ko", // KO not served
    "/ko/ramen",
    "/cafes-coffee", // only draft C attaches → 404
    "/izakaya", // A is a secondary attachment, not primary → 404
    "/activities", // hidden root
    "/surf-lessons", // hidden subtree
  ];
  for (const path of NOT_FOUND) {
    test(`${path} → 404`, async ({ request }) => {
      expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404);
    });
  }
});
