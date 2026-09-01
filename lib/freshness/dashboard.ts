import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAppConfig } from "@/lib/public-read/config";
import {
  buildFreshnessDashboard,
  type FreshnessDashboard,
  type ListingInput,
  type ProvenanceInput,
  type TargetLink,
} from "./model";

export type { FreshnessFact, ListingFreshness } from "./model";

type RawLocale = { id: string; locale: string; name: string | null };
type RawListing = {
  id: string;
  location_id: string;
  publication_status: string;
  listing_locales: RawLocale[];
};

export async function fetchFreshnessDashboard(
  db: SupabaseClient,
): Promise<{ data: FreshnessDashboard | null; error: Error | null }> {
  try {
    const [config, listingResult, provenanceResult] = await Promise.all([
      loadAppConfig(db),
      db
        .from("listings")
        .select("id,location_id,publication_status,listing_locales(id,locale,name)")
        .order("created_at", { ascending: true }),
      db
        .from("provenance")
        .select("id,target_table,target_id,field,supplied_by,verified_at,expires_at")
        .eq("is_current", true)
        .eq("approval_status", "approved"),
    ]);

    if (listingResult.error) throw new Error(`listings load failed: ${listingResult.error.message}`);
    if (provenanceResult.error) throw new Error(`provenance load failed: ${provenanceResult.error.message}`);

    const rawListings = (listingResult.data ?? []) as RawListing[];
    const locationIds = rawListings.map((listing) => listing.location_id);
    const listingIds = rawListings.map((listing) => listing.id);
    const [hoursResult, mediaResult, menuResult] = await Promise.all([
      locationIds.length
        ? db.from("hours_sets").select("id,location_id").in("location_id", locationIds)
        : Promise.resolve({ data: [], error: null }),
      listingIds.length
        ? db.from("listing_media").select("listing_id,media_id").in("listing_id", listingIds)
        : Promise.resolve({ data: [], error: null }),
      listingIds.length
        ? db
            .from("menu_versions")
            .select("id,menu_documents!inner(listing_id)")
            .in("menu_documents.listing_id", listingIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (hoursResult.error) throw new Error(`hours load failed: ${hoursResult.error.message}`);
    if (mediaResult.error) throw new Error(`media load failed: ${mediaResult.error.message}`);
    if (menuResult.error) throw new Error(`menus load failed: ${menuResult.error.message}`);

    const targetLinks: TargetLink[] = [];
    const listingIdByLocation = new Map(rawListings.map((listing) => [listing.location_id, listing.id]));
    for (const listing of rawListings) {
      targetLinks.push({ targetTable: "listings", targetId: listing.id, listingId: listing.id });
      targetLinks.push({ targetTable: "locations", targetId: listing.location_id, listingId: listing.id });
      for (const locale of listing.listing_locales ?? []) {
        targetLinks.push({ targetTable: "listing_locales", targetId: locale.id, listingId: listing.id });
      }
    }
    for (const hours of (hoursResult.data ?? []) as { id: string; location_id: string }[]) {
      const listingId = listingIdByLocation.get(hours.location_id);
      if (listingId) targetLinks.push({ targetTable: "hours_sets", targetId: hours.id, listingId });
    }
    for (const media of (mediaResult.data ?? []) as { listing_id: string; media_id: string }[]) {
      targetLinks.push({ targetTable: "media", targetId: media.media_id, listingId: media.listing_id });
    }
    for (const menu of (menuResult.data ?? []) as unknown as {
      id: string;
      menu_documents: { listing_id: string };
    }[]) {
      targetLinks.push({
        targetTable: "menu_versions",
        targetId: menu.id,
        listingId: menu.menu_documents.listing_id,
      });
    }

    const listings: ListingInput[] = rawListings.map((listing) => ({
      id: listing.id,
      name:
        listing.listing_locales.find((locale) => locale.locale === "en")?.name ??
        listing.listing_locales.find((locale) => locale.name)?.name ??
        "Untitled listing",
      publicationStatus: listing.publication_status,
    }));
    const provenance: ProvenanceInput[] = (provenanceResult.data ?? []).map(
      (row: {
        id: string;
        target_table: string;
        target_id: string;
        field: string;
        supplied_by: string;
        verified_at: string;
        expires_at: string | null;
      }) => ({
        id: row.id,
        targetTable: row.target_table,
        targetId: row.target_id,
        field: row.field,
        suppliedBy: row.supplied_by,
        verifiedAt: row.verified_at,
        expiresAt: row.expires_at,
      }),
    );

    return { data: buildFreshnessDashboard(listings, targetLinks, provenance, config, new Date()), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Freshness load failed") };
  }
}
