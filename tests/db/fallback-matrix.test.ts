import { describe, expect, it } from "vitest";
import { sql, withRollback } from "./helpers";
import { LISTING, MENU } from "./fixtures";

/**
 * Fallback-matrix suite (slice-1 §publication contract, ADR-008): one case
 * per matrix row per affected locale, at the layer where the rule is
 * DB-enforceable in CP1. Rows resolved in the read-model DTOs (photo-alt EN
 * fallback flagging, templated SEO derivation, editorial-note omission in
 * rendering) get their render-layer cases in CP4 with /lib/public-read —
 * marked .todo here so the suite stays the checklist.
 */

describe("Name — no implicit fallback (JA page requires JA name)", () => {
  it("ja page disappears when ja name is missing even though EN name exists", async () => {
    await withRollback(async (tx) => {
      await tx`update listing_locales set name = null where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      const ja = await tx`select 1 from publishable_locale_pages where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      const en = await tx`select 1 from publishable_locale_pages where listing_id = ${LISTING.ramen} and locale = 'en'`;
      expect(ja).toEqual([]); // EN never fills in for a JA identity field
      expect(en).toHaveLength(1);
    });
  });

  it("a Latin-script JA name is legitimate when explicitly entered in-locale", async () => {
    await withRollback(async (tx) => {
      await tx`update listing_locales set name = 'Aloha Ramen Hale' where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      const ja = await tx`select 1 from publishable_locale_pages where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      expect(ja).toHaveLength(1);
    });
  });
});

describe("Primary category label/slug — no fallback", () => {
  it("ja page disappears when the category lacks its ja locale row", async () => {
    await withRollback(async (tx) => {
      await tx`delete from category_locales where category_id = 'e0000000-0000-4000-8000-000000000011' and locale = 'ja'`;
      const ja = await tx`select 1 from publishable_locale_pages where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      expect(ja).toEqual([]);
    });
  });
});

describe("Editorial note — optional, omitted (never EN prose on a JA page)", () => {
  it("a missing ja editorial note does not affect page eligibility", async () => {
    // seed: A/en has an editorial note, A/ja has none — and A/ja serves
    const note = await sql`
      select editorial_note from listing_locales
      where listing_id = ${LISTING.ramen} and locale = 'ja'`;
    expect(note[0]?.editorial_note).toBeNull();
    const ja = await sql`select 1 from publishable_locale_pages where listing_id = ${LISTING.ramen} and locale = 'ja'`;
    expect(ja).toHaveLength(1);
  });

  it.todo("CP4: listing DTO omits the editorial-note section entirely when absent in-locale");
});

describe("Menus — render in a locale iff locale status ∈ {approved, published}", () => {
  it("ja menu is renderable in seed (published), ko is not (translation_pending)", async () => {
    const renderable = await sql`
      select mvl.locale from menu_version_locales mvl
      join menu_versions mv on mv.id = mvl.menu_version_id
      join menu_documents md on md.id = mv.menu_document_id
      where md.listing_id = ${LISTING.ramen}
        and mvl.status in ('approved', 'published')
      order by mvl.locale`;
    expect(renderable.map((r) => r.locale)).toEqual(["en", "ja"]);
  });

  it("page stays published without a renderable menu (menu coming soon path)", async () => {
    await withRollback(async (tx) => {
      await tx`update menu_version_locales set status = 'qa_pending' where id = ${MENU.mvlJa}`;
      const ja = await tx`select 1 from publishable_locale_pages where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      expect(ja).toHaveLength(1); // menu absence never blocks the page
    });
  });

  it("listing B serves with no menu at all", async () => {
    const pages = await sql`select locale from publishable_locale_pages where listing_id = ${LISTING.sushi} order by locale`;
    expect(pages.map((r) => r.locale)).toEqual(["en", "ja"]);
  });
});

describe("Money terms — never fall back, never fabricated (PRD §11)", () => {
  it("market-price items cannot carry a stored amount (CHECK)", async () => {
    await withRollback(async (tx) => {
      await expect(
        tx`update menu_items set price_cents = 1200 where id = ${MENU.itemPoke}`,
      ).rejects.toThrow(/menu_items_market_price_check/);
    });
  });

  it.todo("CP4: menu DTO renders locale price strings only from that locale's approved menu version");
});

describe("Deferred to CP4 read-model (documented, not forgotten)", () => {
  it.todo("Photo alt text: QA'd EN fallback allowed, flagged in DTO data");
  it.todo("SEO title/description: per-locale template composition, never EN prose");
  it.todo("Provenance/verification labels render from i18n app strings, not content");
});
