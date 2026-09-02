import "server-only";

import { createSupabaseServiceClient } from "@/lib/auth/server";

export type DealRevealResult =
  | { result: "ok"; code: string; listingId: string; counted: boolean }
  | { result: "expired"; listingId: string }
  | { result: "not_found" | "failed" };

export interface DealAlternative {
  id: string;
  title: string;
  listingId: string;
  listingName: string;
  listingSlug: string;
  expiresAt: string;
}

export async function revealDeal(dealId: string, locale: string, sessionId: string): Promise<DealRevealResult> {
  const db = createSupabaseServiceClient();
  const { data, error } = await db.rpc("reveal_active_deal", {
    p_deal_id: dealId,
    p_locale: locale,
    p_session_id: sessionId,
  });
  if (error) return { result: "failed" };
  const row = (Array.isArray(data) ? data[0] : data) as {
    result?: string;
    reveal_code?: string | null;
    listing_id?: string | null;
    counted?: boolean;
  } | null;
  if (row?.result === "ok" && row.reveal_code && row.listing_id) {
    return { result: "ok", code: row.reveal_code, listingId: row.listing_id, counted: Boolean(row.counted) };
  }
  if (row?.result === "expired" && row.listing_id) return { result: "expired", listingId: row.listing_id };
  if (row?.result === "not_found") return { result: "not_found" };
  return { result: "failed" };
}

export async function findActiveDealAlternatives(
  locale: string,
  excludedDealId: string,
  limit: number,
): Promise<DealAlternative[]> {
  if (limit <= 0) return [];
  const now = new Date().toISOString();
  const db = createSupabaseServiceClient();
  const { data, error } = await db
    .from("deals")
    .select("id,listing_id,expires_at,deal_locales!inner(title),listings!inner(listing_locales!inner(name,slug))")
    .eq("status", "active")
    .lte("starts_at", now)
    .gt("expires_at", now)
    .neq("id", excludedDealId)
    .eq("deal_locales.locale", locale)
    .eq("deal_locales.status", "published")
    .eq("listings.listing_locales.locale", locale)
    .eq("listings.listing_locales.status", "published")
    .order("expires_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  type Row = {
    id: string; listing_id: string; expires_at: string;
    deal_locales: Array<{ title: string }>;
    listings: { listing_locales: Array<{ name: string; slug: string }> };
  };
  return ((data ?? []) as unknown as Row[]).flatMap((row) => {
    const deal = row.deal_locales[0];
    const listing = row.listings.listing_locales[0];
    return deal && listing ? [{
      id: row.id,
      title: deal.title,
      listingId: row.listing_id,
      listingName: listing.name,
      listingSlug: listing.slug,
      expiresAt: row.expires_at,
    }] : [];
  });
}
