import { describe, it } from "vitest";
import { withRollback, expectErrorIn } from "./helpers";
import { CATEGORY, LISTING } from "./fixtures";

/**
 * Primary-category integrity (ADR-007, migration 8): DEFERRED constraint
 * triggers — `set constraints ... immediate` forces the check at statement
 * time so negatives are testable inside rolled-back transactions.
 */

describe("listings.primary_category_id integrity", () => {
  it("rejects a primary category that is not attached via listing_categories", async () => {
    await withRollback(async (tx) => {
      await tx`set constraints listings_primary_category_guard immediate`;
      await expectErrorIn(tx, /primary_category_integrity.*not attached/, (sp) =>
        sp`update listings set primary_category_id = ${CATEGORY.izakaya} where id = ${LISTING.sushi}`,
      );
    });
  });

  it("rejects an inactive primary category", async () => {
    await withRollback(async (tx) => {
      await tx`update categories set active = false where id = ${CATEGORY.izakaya}`;
      await tx`insert into listing_categories (listing_id, category_id) values (${LISTING.sushi}, ${CATEGORY.izakaya})`;
      await tx`set constraints listings_primary_category_guard immediate`;
      await expectErrorIn(tx, /primary_category_integrity.*not active/, (sp) =>
        sp`update listings set primary_category_id = ${CATEGORY.izakaya} where id = ${LISTING.sushi}`,
      );
    });
  });

  it("accepts attach-then-set within one transaction (deferred by design)", async () => {
    await withRollback(async (tx) => {
      // natural admin flow: attach first, then set primary — same tx
      await tx`insert into listing_categories (listing_id, category_id) values (${LISTING.sushi}, ${CATEGORY.izakaya})`;
      await tx`update listings set primary_category_id = ${CATEGORY.izakaya} where id = ${LISTING.sushi}`;
      await tx`set constraints listings_primary_category_guard immediate`; // would raise if broken
    });
  });

  it("rejects removing the listing_categories row that backs a primary", async () => {
    await withRollback(async (tx) => {
      await tx`set constraints listing_categories_primary_guard immediate`;
      await expectErrorIn(tx, /primary_category_integrity.*not attached/, (sp) =>
        sp`delete from listing_categories where listing_id = ${LISTING.ramen} and category_id = ${CATEGORY.ramen}`,
      );
    });
  });

  it("allows removing a non-primary attachment", async () => {
    await withRollback(async (tx) => {
      await tx`set constraints listing_categories_primary_guard immediate`;
      await tx`delete from listing_categories where listing_id = ${LISTING.ramen} and category_id = ${CATEGORY.izakaya}`;
    });
  });

  it("there is no is_primary column on listing_categories (ADR-007)", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /column "is_primary" does not exist/, (sp) =>
        sp`select is_primary from listing_categories limit 1`,
      );
    });
  });
});
