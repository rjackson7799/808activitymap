import { describe, expect, it } from "vitest";
import { withRollback, expectErrorIn } from "./helpers";
import { CATEGORY, LISTING } from "./fixtures";

/**
 * Slug/alias collision triggers (ADR-006, migration 13), including
 * NFC-equivalence: composed and decomposed forms of the same JA string must
 * collide, not coexist.
 */

// "ボガード" — composed vs decomposed (ホ/カ + combining dakuten U+3099)
const COMPOSED = "ボガード".normalize("NFC");
const DECOMPOSED = COMPOSED.normalize("NFD");

describe("alias ↔ canonical collisions (both directions)", () => {
  it("rejects an alias equal to a canonical listing slug in the same locale", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /slug_alias_collision/, (sp) =>
        sp`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
           values ('listing', 'en', 'waikiki-sushi-ten', ${LISTING.ramen})`,
      );
    });
  });

  it("rejects an alias equal to a canonical category slug in the same locale", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /slug_alias_collision/, (sp) =>
        sp`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
           values ('category', 'ja', 'ラーメン', ${CATEGORY.sushi})`,
      );
    });
  });

  it("allows the same string as alias in a different locale or scope", async () => {
    await withRollback(async (tx) => {
      // 'ramen' is a category slug in en — as a LISTING alias it is fine
      await tx`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
               values ('listing', 'en', 'ramen', ${LISTING.ramen})`;
    });
  });

  it("rejects a canonical listing slug that collides with an existing alias", async () => {
    await withRollback(async (tx) => {
      // seed: ja listing alias 'aloha-ramen-hale' → listing A
      await expectErrorIn(tx, /slug_alias_collision/, (sp) =>
        sp`update listing_locales set slug = 'aloha-ramen-hale'
           where listing_id = ${LISTING.sushi} and locale = 'ja'`,
      );
    });
  });

  it("rejects a canonical category slug that collides with a category alias", async () => {
    await withRollback(async (tx) => {
      await tx`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
               values ('category', 'en', 'noodles', ${CATEGORY.ramen})`;
      await expectErrorIn(tx, /slug_alias_collision/, (sp) =>
        sp`update category_locales set slug = 'noodles'
           where category_id = ${CATEGORY.sushi} and locale = 'en'`,
      );
    });
  });

  it("a listing may re-take its OWN alias as canonical (repeated slug change)", async () => {
    await withRollback(async (tx) => {
      // seed alias 'aloha-ramen-hale' (ja) targets listing A itself
      await tx`update listing_locales set slug = 'aloha-ramen-hale'
               where listing_id = ${LISTING.ramen} and locale = 'ja'`;
    });
  });
});

describe("NFC equivalence", () => {
  it("stores aliases NFC-normalized", async () => {
    await withRollback(async (tx) => {
      await tx`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
               values ('listing', 'ja', ${DECOMPOSED}, ${LISTING.ramen})`;
      const row = await tx`select alias_slug from slug_aliases where target_id = ${LISTING.ramen} and alias_slug = ${COMPOSED}`;
      expect(row).toHaveLength(1); // decomposed input found via composed form
    });
  });

  it("NFC-equivalent alias/canonical forms collide", async () => {
    await withRollback(async (tx) => {
      await tx`update listing_locales set slug = ${COMPOSED}
               where listing_id = ${LISTING.sushi} and locale = 'ja'`;
      await expectErrorIn(tx, /slug_alias_collision/, (sp) =>
        sp`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
           values ('listing', 'ja', ${DECOMPOSED}, ${LISTING.ramen})`,
      );
    });
  });

  it("canonical slugs are NFC-normalized on write", async () => {
    await withRollback(async (tx) => {
      await tx`update listing_locales set slug = ${DECOMPOSED}
               where listing_id = ${LISTING.sushi} and locale = 'ja'`;
      const row = await tx`select slug from listing_locales where listing_id = ${LISTING.sushi} and locale = 'ja'`;
      expect(row[0]!.slug).toBe(COMPOSED);
    });
  });

  it("NFC-equivalent duplicate aliases collide on the unique key", async () => {
    await withRollback(async (tx) => {
      await tx`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
               values ('listing', 'ja', ${COMPOSED}, ${LISTING.ramen})`;
      await expectErrorIn(tx, /duplicate key/, (sp) =>
        sp`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
           values ('listing', 'ja', ${DECOMPOSED}, ${LISTING.sushi})`,
      );
    });
  });
});

describe("alias targets", () => {
  it("aliases must point at an existing canonical target (single hop by construction)", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /does not exist/, (sp) =>
        sp`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
           values ('listing', 'en', 'ghost-listing', '00000000-0000-4000-8000-00000000dead')`,
      );
      await expectErrorIn(tx, /does not exist/, (sp) =>
        sp`insert into slug_aliases (route_scope, locale, alias_slug, target_id)
           values ('category', 'en', 'ghost-category', '00000000-0000-4000-8000-00000000dead')`,
      );
    });
  });
});
