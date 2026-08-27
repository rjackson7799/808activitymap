import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Publishing read model (CP3) — staff-side, through the RLS-bound server
 * client. The publish surface renders live blockers from
 * can_publish_listing_locale (enforcement, not advice — the same gate the
 * guarded publish fn runs), so a publisher sees exactly why a locale can't
 * publish before trying.
 */

export interface Blocker {
  blocker_code: string;
  detail: Record<string, unknown> | null;
}

export interface ListingLocaleView {
  locale: string;
  status: string;
  name: string | null;
  blockers: Blocker[];
}

export interface MenuLocaleView {
  id: string;
  locale: string;
  status: string;
  approval_type: string | null;
}

export interface EvidenceMedia {
  id: string;
  path: string;
}

export interface ListingRow {
  id: string;
  publication_status: string;
  name: string | null;
  locales: { locale: string; status: string }[];
}

export interface ListingPublishView {
  id: string;
  publication_status: string;
  locales: ListingLocaleView[];
  menuLocales: MenuLocaleView[];
  evidenceMedia: EvidenceMedia[];
}

interface RawListingLocale {
  locale: string;
  status: string;
  name: string | null;
  slug: string | null;
}

export async function fetchListings(
  supabase: SupabaseClient,
): Promise<{ data: ListingRow[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from("listings")
    .select("id, publication_status, listing_locales(locale, status, name)")
    .order("created_at", { ascending: true });
  if (error) return { data: null, error };
  type ListRowLocale = { locale: string; status: string; name: string | null };
  const rows: ListingRow[] = (data ?? []).map(
    (l: { id: string; publication_status: string; listing_locales: ListRowLocale[] }) => ({
      id: l.id,
      publication_status: l.publication_status,
      name: (l.listing_locales ?? []).find((ll) => ll.locale === "en")?.name ?? l.listing_locales?.[0]?.name ?? null,
      locales: (l.listing_locales ?? [])
        .map((ll) => ({ locale: ll.locale, status: ll.status }))
        .sort((a, b) => a.locale.localeCompare(b.locale)),
    }),
  );
  return { data: rows, error: null };
}

export async function fetchListingPublishView(
  supabase: SupabaseClient,
  id: string,
): Promise<{ data: ListingPublishView | null; error: unknown }> {
  const { data: listing, error } = await supabase
    .from("listings")
    .select("id, publication_status, listing_locales(locale, status, name, slug)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null, error };
  if (!listing) return { data: null, error: null };

  const rawLocales: RawListingLocale[] = (listing.listing_locales ?? []) as RawListingLocale[];
  const sorted = [...rawLocales].sort((a, b) => a.locale.localeCompare(b.locale));

  // Live blockers per locale (the enforcement gate).
  const locales: ListingLocaleView[] = [];
  for (const ll of sorted) {
    const { data: blockers } = await supabase.rpc("can_publish_listing_locale", {
      p_listing_id: id,
      p_locale: ll.locale,
    });
    locales.push({
      locale: ll.locale,
      status: ll.status,
      name: ll.name,
      blockers: (blockers as Blocker[] | null) ?? [],
    });
  }

  // Menu version-locales for this listing (via the document → version chain).
  const { data: menuRows } = await supabase
    .from("menu_version_locales")
    .select("id, locale, status, approval_type, menu_versions!inner(menu_documents!inner(listing_id))")
    .eq("menu_versions.menu_documents.listing_id", id)
    .order("locale", { ascending: true });
  const menuLocales: MenuLocaleView[] = (menuRows ?? []).map(
    (m: { id: string; locale: string; status: string; approval_type: string | null }) => ({
      id: m.id,
      locale: m.locale,
      status: m.status,
      approval_type: m.approval_type,
    }),
  );

  // Evidence documents a publisher can attach when recording menu approval.
  const { data: evidence } = await supabase
    .from("media")
    .select("id, path")
    .eq("kind", "evidence")
    .order("path", { ascending: true });
  const evidenceMedia: EvidenceMedia[] = (evidence as EvidenceMedia[] | null) ?? [];

  return {
    data: {
      id: listing.id,
      publication_status: listing.publication_status,
      locales,
      menuLocales,
      evidenceMedia,
    },
    error: null,
  };
}
