import { describe, expect, it } from "vitest";
import { buildFreshnessDashboard } from "@/lib/freshness/model";

const config = {
  staleness_thresholds_days: { hours: 90, price: 120, menu: 180, business_fact: 365, editorial_note: 90 },
  badge_freshness_rules: { badge_fields: ["hours", "price"], suspend_on_stale: true },
};
const now = new Date("2026-09-01T00:00:00Z");

describe("buildFreshnessDashboard", () => {
  it("associates target facts with listings and puts stale listings first", () => {
    const dashboard = buildFreshnessDashboard(
      [
        { id: "fresh", name: "Aloha", publicationStatus: "draft" },
        { id: "stale", name: "Waikiki", publicationStatus: "published" },
      ],
      [
        { targetTable: "locations", targetId: "loc-fresh", listingId: "fresh" },
        { targetTable: "locations", targetId: "loc-stale", listingId: "stale" },
      ],
      [
        { id: "p-fresh", targetTable: "locations", targetId: "loc-fresh", field: "hours", suppliedBy: "vendor", verifiedAt: "2026-08-30T00:00:00Z", expiresAt: null },
        { id: "p-stale", targetTable: "locations", targetId: "loc-stale", field: "hours", suppliedBy: "editor", verifiedAt: "2026-01-01T00:00:00Z", expiresAt: null },
      ],
      config,
      now,
    );

    expect(dashboard.listings.map((listing) => listing.id)).toEqual(["stale", "fresh"]);
    expect(dashboard.staleFacts).toBe(1);
    expect(dashboard.listingsNeedingAttention).toBe(1);
    expect(dashboard.listings[0]?.facts[0]).toMatchObject({ isStale: true, affectsBadge: true });
  });

  it("flags a published listing with no current approved provenance without inventing missing fields", () => {
    const dashboard = buildFreshnessDashboard(
      [{ id: "published", name: "No evidence", publicationStatus: "published" }],
      [],
      [],
      config,
      now,
    );

    expect(dashboard.listings[0]).toMatchObject({ facts: [], needsAttention: true });
    expect(dashboard.currentFacts).toBe(0);
    expect(dashboard.listingsNeedingAttention).toBe(1);
  });
});
