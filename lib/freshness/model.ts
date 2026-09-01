import type { AppConfig } from "@/config/app-config";
import {
  isProvenanceStale,
  provenanceBadgeKey,
  type StalenessThresholds,
} from "@/lib/public-read/freshness";

export interface FreshnessFact {
  id: string;
  targetTable: string;
  field: string;
  suppliedBy: string;
  verifiedAt: string;
  expiresAt: string | null;
  isStale: boolean;
  affectsBadge: boolean;
}

export interface ListingFreshness {
  id: string;
  name: string;
  publicationStatus: string;
  facts: FreshnessFact[];
  staleCount: number;
  needsAttention: boolean;
}

export interface FreshnessDashboard {
  listings: ListingFreshness[];
  thresholds: StalenessThresholds;
  publishedListings: number;
  currentFacts: number;
  staleFacts: number;
  listingsNeedingAttention: number;
}

export interface ListingInput { id: string; name: string; publicationStatus: string }
export interface TargetLink { targetTable: string; targetId: string; listingId: string }
export interface ProvenanceInput {
  id: string;
  targetTable: string;
  targetId: string;
  field: string;
  suppliedBy: string;
  verifiedAt: string;
  expiresAt: string | null;
}

export function buildFreshnessDashboard(
  listings: ListingInput[],
  targetLinks: TargetLink[],
  provenance: ProvenanceInput[],
  config: Pick<AppConfig, "staleness_thresholds_days" | "badge_freshness_rules">,
  now: Date,
): FreshnessDashboard {
  const listingIdsByTarget = new Map<string, string[]>();
  for (const link of targetLinks) {
    const key = `${link.targetTable}:${link.targetId}`;
    listingIdsByTarget.set(key, [...(listingIdsByTarget.get(key) ?? []), link.listingId]);
  }

  const factsByListing = new Map<string, FreshnessFact[]>();
  for (const row of provenance) {
    const listingIds = listingIdsByTarget.get(`${row.targetTable}:${row.targetId}`) ?? [];
    const isStale = isProvenanceStale(row, config.staleness_thresholds_days, now);
    const affectsBadge = config.badge_freshness_rules.badge_fields.includes(provenanceBadgeKey(row));
    for (const listingId of listingIds) {
      const fact: FreshnessFact = {
        id: row.id,
        targetTable: row.targetTable,
        field: row.field,
        suppliedBy: row.suppliedBy,
        verifiedAt: row.verifiedAt,
        expiresAt: row.expiresAt,
        isStale,
        affectsBadge,
      };
      factsByListing.set(listingId, [...(factsByListing.get(listingId) ?? []), fact]);
    }
  }

  const dashboardListings = listings
    .map((listing) => {
      const facts = (factsByListing.get(listing.id) ?? []).sort(
        (a, b) => Number(b.isStale) - Number(a.isStale) || a.field.localeCompare(b.field),
      );
      return {
        ...listing,
        facts,
        staleCount: facts.filter((fact) => fact.isStale).length,
        needsAttention:
          facts.some((fact) => fact.isStale) ||
          (listing.publicationStatus === "published" && facts.length === 0),
      };
    })
    .sort(
      (a, b) =>
        Number(b.needsAttention) - Number(a.needsAttention) ||
        b.staleCount - a.staleCount ||
        a.name.localeCompare(b.name),
    );

  const allFacts = dashboardListings.flatMap((listing) => listing.facts);
  return {
    listings: dashboardListings,
    thresholds: config.staleness_thresholds_days,
    publishedListings: listings.filter((listing) => listing.publicationStatus === "published").length,
    currentFacts: allFacts.length,
    staleFacts: allFacts.filter((fact) => fact.isStale).length,
    listingsNeedingAttention: dashboardListings.filter((listing) => listing.needsAttention).length,
  };
}
