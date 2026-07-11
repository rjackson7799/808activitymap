import { describe, expect, it } from "vitest";
import { sql, withRollback, type TxSql } from "./helpers";
import { LISTING, LOC } from "./fixtures";

/**
 * publishable_locale_pages grid (slice-1 §public read model): locale-status ×
 * listing-status × min-field combinations. The view is the single eligibility
 * source for generateStaticParams/sitemaps/revalidation, so its edges ARE the
 * public surface's edges.
 */

const inView = async (tx: TxSql, listing: string, locale: string) => {
  const rows = await tx`
    select 1 from publishable_locale_pages
    where listing_id = ${listing} and locale = ${locale}`;
  return rows.length > 0;
};

describe("publishable_locale_pages — seed baseline", () => {
  it("contains exactly the four published EN/JA pages, nothing else", async () => {
    const rows = await sql`
      select listing_id, locale from publishable_locale_pages
      order by listing_id, locale`;
    expect(rows).toEqual([
      { listing_id: LISTING.ramen, locale: "en" },
      { listing_id: LISTING.ramen, locale: "ja" },
      { listing_id: LISTING.sushi, locale: "en" },
      { listing_id: LISTING.sushi, locale: "ja" },
    ]);
  });

  it("never contains KO rows pre-KO, nor any draft listing", async () => {
    const ko = await sql`select 1 from publishable_locale_pages where locale = 'ko'`;
    const draft = await sql`select 1 from publishable_locale_pages where listing_id = ${LISTING.coffee}`;
    expect(ko).toEqual([]);
    expect(draft).toEqual([]);
  });
});

describe("locale-status dimension", () => {
  const serving = ["qa_approved", "vendor_approved", "published"];
  const notServing = [
    "not_started", "machine_draft", "qa_pending",
    "vendor_review_pending", "stale", "withdrawn",
  ];

  it.each(serving)("locale status %s serves (given listing published + fields complete)", async (status) => {
    await withRollback(async (tx) => {
      await tx`update listing_locales set status = ${status}
               where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      expect(await inView(tx, LISTING.ramen, "ja")).toBe(true);
    });
  });

  it.each(notServing)("locale status %s never serves", async (status) => {
    await withRollback(async (tx) => {
      await tx`update listing_locales set status = ${status}
               where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      expect(await inView(tx, LISTING.ramen, "ja")).toBe(false);
      // the other locale is unaffected
      expect(await inView(tx, LISTING.ramen, "en")).toBe(true);
    });
  });
});

describe("listing publication-status dimension", () => {
  it.each(["draft", "review_pending", "unpublished", "archived"])(
    "listing status %s removes every locale page",
    async (status) => {
      await withRollback(async (tx) => {
        await tx`update listings set publication_status = ${status} where id = ${LISTING.ramen}`;
        expect(await inView(tx, LISTING.ramen, "en")).toBe(false);
        expect(await inView(tx, LISTING.ramen, "ja")).toBe(false);
      });
    },
  );
});

describe("min-field dimension (each removal excludes the page)", () => {
  const cases: Array<[string, (tx: TxSql) => Promise<unknown>]> = [
    ["locale name", (tx) => tx`update listing_locales set name = null where listing_id = ${LISTING.ramen} and locale = 'ja'`],
    ["locale slug", (tx) => tx`update listing_locales set slug = null where listing_id = ${LISTING.ramen} and locale = 'ja'`],
    ["address", (tx) => tx`update locations set address = null where id = ${LOC.ramen}`],
    ["hours set", (tx) => tx`delete from hours_sets where location_id = ${LOC.ramen}`],
    ["primary category", (tx) => tx`update listings set primary_category_id = null where id = ${LISTING.ramen}`],
    ["category ja locale row", (tx) => tx`delete from category_locales where category_id = 'e0000000-0000-4000-8000-000000000011' and locale = 'ja'`],
    ["category attachment", (tx) => tx`delete from listing_categories where listing_id = ${LISTING.ramen} and category_id = 'e0000000-0000-4000-8000-000000000011'`],
    ["all photos", (tx) => tx`delete from listing_media where listing_id = ${LISTING.ramen}`],
  ];

  it.each(cases)("removing %s excludes the ja page", async (_label, break_) => {
    await withRollback(async (tx) => {
      await break_(tx);
      expect(await inView(tx, LISTING.ramen, "ja")).toBe(false);
    });
  });

  it("photos pending moderation do not satisfy the photo requirement", async () => {
    await withRollback(async (tx) => {
      await tx`update media set moderation_status = 'pending'
               where id in (select media_id from listing_media where listing_id = ${LISTING.ramen})`;
      expect(await inView(tx, LISTING.ramen, "ja")).toBe(false);
    });
  });

  it("photos without rights metadata do not satisfy the photo requirement", async () => {
    await withRollback(async (tx) => {
      await tx`update media set rights = null
               where id in (select media_id from listing_media where listing_id = ${LISTING.ramen})`;
      expect(await inView(tx, LISTING.ramen, "ja")).toBe(false);
    });
  });
});

describe("taxonomy visibility dimension (D4)", () => {
  it("a hidden primary category removes the pages at every level", async () => {
    await withRollback(async (tx) => {
      await tx`update categories set publicly_visible = false
               where id = 'e0000000-0000-4000-8000-000000000011'`;
      expect(await inView(tx, LISTING.ramen, "en")).toBe(false);
      expect(await inView(tx, LISTING.ramen, "ja")).toBe(false);
    });
  });

  it("an inactive primary category removes the pages", async () => {
    await withRollback(async (tx) => {
      await tx`update categories set active = false
               where id = 'e0000000-0000-4000-8000-000000000011'`;
      expect(await inView(tx, LISTING.ramen, "ja")).toBe(false);
    });
  });
});

describe("view access (ADR-004: server-only)", () => {
  it("anon has no access to the view", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      await expect(tx`select * from publishable_locale_pages`).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("authenticated has no access to the view", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await expect(tx`select * from publishable_locale_pages`).rejects.toThrow(
        /permission denied/,
      );
    });
  });
});
