import "server-only";
import { createSupabaseServiceClient } from "@/lib/auth/server";
import type { CorrectionRequestInput } from "./schema";

export type CorrectionInsertResult =
  | { ok: true; id: string; listingName: string }
  | { ok: false; reason: "listing_not_found" | "insert_failed" };

export async function submitCorrection(
  input: CorrectionRequestInput,
  slaHours: number,
): Promise<CorrectionInsertResult> {
  const db = createSupabaseServiceClient();
  const { data: listing, error: listingError } = await db
    .from("listings")
    .select("id, market_id, version, listing_locales!inner(locale, status, name)")
    .eq("id", input.listingId)
    .eq("publication_status", "published")
    .eq("listing_locales.locale", input.locale)
    .eq("listing_locales.status", "published")
    .maybeSingle();

  if (listingError || !listing) return { ok: false, reason: "listing_not_found" };
  const localeRows = listing.listing_locales as unknown as Array<{ name: string | null }>;
  const listingName = localeRows[0]?.name ?? "Listing";
  const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("change_requests")
    .insert({
      market_id: listing.market_id,
      target_table: "listings",
      target_id: listing.id,
      base_version: listing.version,
      diff: { field: input.field, details: input.details },
      proposer_channel: "contributor",
      reporter_name: input.name || null,
      reporter_email: input.email || null,
      sla_due_at: slaDueAt,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, reason: "insert_failed" };
  return { ok: true, id: data.id as string, listingName };
}

