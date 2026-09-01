import { describe, expect, it } from "vitest";
import {
  computeBadgeStatus,
  computeFreshness,
  isProvenanceStale,
  provenanceThresholdKey,
  type ProvenanceRow,
} from "@/lib/public-read/freshness";

/**
 * Freshness summary (D15). Injected `now` makes staleness deterministic. Also pins the
 * allowlist: a freshness fact exposes ONLY { label, verifiedDate, isStale } — never the
 * internal provenance columns (source_type, verified_by, supplied_by, confidence).
 */

const THRESHOLDS = { hours: 90, price: 120, menu: 180, business_fact: 365, editorial_note: 90 };
const NOW = new Date("2026-07-11T00:00:00Z");
const BADGE_RULES = {
  badge_fields: ["name", "address", "geo", "phone", "hours", "photo", "primary_category"],
  suspend_on_stale: true,
};

function row(field: string, verifiedAt: string, expiresAt: string | null = null): ProvenanceRow {
  return { targetTable: "listings", field, verifiedAt, expiresAt };
}

describe("computeFreshness", () => {
  it("marks a recently verified, unexpired fact as fresh", () => {
    const out = computeFreshness([row("name", "2026-07-07T00:00:00Z", "2027-07-01T00:00:00Z")], THRESHOLDS, NOW, "en");
    expect(out.facts).toEqual([{ label: "Business details", verifiedDate: "2026-07-07", isStale: false }]);
    expect(out.anyStale).toBe(false);
  });

  it("marks a fact past its type threshold as stale", () => {
    // hours threshold is 90d; verified 200 days ago → stale.
    const out = computeFreshness([row("hours", "2025-12-20T00:00:00Z")], THRESHOLDS, NOW, "en");
    expect(out.facts).toEqual([{ label: "Hours", verifiedDate: "2025-12-20", isStale: true }]);
    expect(out.anyStale).toBe(true);
  });

  it("marks a fact whose provenance has expired as stale even if recently verified", () => {
    const out = computeFreshness([row("hours", "2026-07-01T00:00:00Z", "2026-07-05T00:00:00Z")], THRESHOLDS, NOW, "en");
    expect(out.facts).toEqual([{ label: "Hours", verifiedDate: "2026-07-01", isStale: true }]);
  });

  it("exposes ONLY the allowlisted keys — no internal provenance columns", () => {
    const out = computeFreshness([row("address", "2026-07-01T00:00:00Z")], THRESHOLDS, NOW, "ja");
    const [fact] = out.facts;
    expect(fact && Object.keys(fact).sort()).toEqual(["isStale", "label", "verifiedDate"]);
    expect(fact?.label).toBe("所在地"); // localized, not a raw field name
  });

  it("orders facts business details → pricing → location → hours → menu", () => {
    const out = computeFreshness(
      [row("hours", "2026-07-01T00:00:00Z"), row("name", "2026-07-01T00:00:00Z"), row("address", "2026-07-01T00:00:00Z")],
      THRESHOLDS,
      NOW,
      "en",
    );
    expect(out.facts.map((f) => f.label)).toEqual(["Business details", "Location", "Hours"]);
  });
});

describe("shared provenance freshness rules", () => {
  it("uses the same configured field groups for the public surface and staff dashboard", () => {
    expect(provenanceThresholdKey("price_band")).toBe("price");
    expect(provenanceThresholdKey("content")).toBe("menu");
    expect(provenanceThresholdKey("phone")).toBe("business_fact");
  });

  it("treats the exact threshold day as current and the next moment as stale", () => {
    const provenance = row("hours", "2026-04-12T00:00:00Z");
    expect(isProvenanceStale(provenance, THRESHOLDS, NOW)).toBe(false);
    expect(isProvenanceStale(provenance, THRESHOLDS, new Date("2026-07-11T00:00:01Z"))).toBe(true);
  });
});

describe("D15 Verified Local badge contract", () => {
  const completeRows = [
    row("name", "2026-07-01T00:00:00Z"),
    { ...row("address", "2026-07-01T00:00:00Z"), targetTable: "locations" },
    { ...row("geo", "2026-07-01T00:00:00Z"), targetTable: "locations" },
    { ...row("phone", "2026-07-01T00:00:00Z"), targetTable: "locations" },
    { ...row("hours", "2026-07-01T00:00:00Z"), targetTable: "locations" },
    { ...row("rights", "2026-07-01T00:00:00Z"), targetTable: "media" },
    row("primary_category", "2026-07-01T00:00:00Z"),
  ];

  it("verifies only a complete, current evidence set", () => {
    expect(computeBadgeStatus(completeRows, THRESHOLDS, BADGE_RULES, NOW)).toBe("verified");
    expect(computeBadgeStatus(completeRows.filter((fact) => fact.field !== "phone"), THRESHOLDS, BADGE_RULES, NOW)).toBe("incomplete");
  });

  it("suspends the badge when a required fact is stale", () => {
    const staleHours = completeRows.map((fact) =>
      fact.field === "hours" ? { ...fact, expiresAt: "2026-07-01T00:00:00Z" } : fact,
    );
    expect(computeBadgeStatus(staleHours, THRESHOLDS, BADGE_RULES, NOW)).toBe("stale");
  });

  it("accepts one fresh rights-cleared photo when another attached photo is stale", () => {
    const rows = [
      ...completeRows,
      { targetTable: "media", field: "rights", verifiedAt: "2025-01-01T00:00:00Z", expiresAt: null },
    ];
    expect(computeBadgeStatus(rows, THRESHOLDS, BADGE_RULES, NOW)).toBe("verified");
  });
});
