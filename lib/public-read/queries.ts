import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/config/env";
import type { Locale } from "@/lib/locales";
import { loadAppConfig } from "./config";
import type {
  CategoryDTO,
  CategoryRef,
  HomeDTO,
  HoursDTO,
  HoursDay,
  ListingCardDTO,
  ListingDTO,
  MenuDTO,
  PhotoDTO,
  SitemapRow,
  SlugResolution,
} from "./dto";
import {
  formatMenuItemPrice,
  resolveAltText,
  resolveEditorialNote,
  resolveName,
  resolveSeo,
} from "./fallback";
import { computeFreshness, type ProvenanceRow } from "./freshness";
import { categoryPath, homePath, listingPath } from "./paths";

/**
 * Public read model (CP4) — the public authorization boundary. Reads run through the
 * service-role client (RLS bypassed, ADR-004), so leakage prevention lives entirely
 * here and is proven by the BLOCKING leakage suite. Discipline (Architecture #2):
 *  - the eligibility view `publishable_locale_pages` is the source of truth for WHICH
 *    pages exist; every content fetch is gated by it;
 *  - explicit column allowlists (never select *); explicit DTO construction;
 *  - per-locale intersection — every base fetch is scoped to the requested locale, so
 *    KO / machine_draft / withdrawn rows can never ride along;
 *  - the fallback engine owns money / name / menu / SEO rules.
 *
 * The client is injected (matching the staff read model) so this module has no
 * request-context or server-only import and stays unit/integration testable.
 */

// Venues in these operational states are excluded from the public surface. NOTE (owner
// flag): the publication contract does not gate operational_status, so this is an
// app-layer eligibility rule living OUTSIDE the view — confirm the policy; the safe
// default is to hide closed/suspended/disputed venues. temporarily_closed stays (banner).
const EXCLUDED_OPERATIONAL = new Set(["permanently_closed", "suspended", "disputed"]);

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function publicPhotoUrl(path: string): string {
  return `${env().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-photos/${path}`;
}

async function isEligible(client: SupabaseClient, listingId: string, locale: Locale): Promise<boolean> {
  const { data } = await client
    .from("publishable_locale_pages")
    .select("listing_id")
    .eq("listing_id", listingId)
    .eq("locale", locale)
    .maybeSingle();
  return Boolean(data);
}

/** Union of publicly-served locales across all markets (fences KO until Slice 2). */
export async function getServedLocaleSet(client: SupabaseClient): Promise<Set<Locale>> {
  const config = await loadAppConfig(client);
  const set = new Set<Locale>();
  for (const locales of Object.values(config.locale_availability)) {
    for (const l of locales) set.add(l);
  }
  return set;
}

/** Eligible (listing, locale) pairs, filtered to publicly-served locales. */
export async function listEligiblePages(
  client: SupabaseClient,
): Promise<{ listingId: string; locale: Locale }[]> {
  const served = await getServedLocaleSet(client);
  const { data, error } = await client
    .from("publishable_locale_pages")
    .select("listing_id, locale");
  if (error) throw new Error(`publishable_locale_pages read failed: ${error.message}`);
  return (data ?? [])
    .map((r) => ({ listingId: r.listing_id as string, locale: r.locale as Locale }))
    .filter((r) => served.has(r.locale));
}

function toHoursDTO(
  weekly: Record<string, { closed?: boolean; is_24h?: boolean; spans?: { open: string; close: string }[] }>,
  exceptions: { date: string; closed: boolean; spans: { open: string; close: string }[] | null; reason: string | null }[],
  meta: { unknown: boolean; sellsOutEarly: boolean; appointmentOnly: boolean; lastOrderOffsetMin: number | null; timezone: string },
): HoursDTO {
  const out: HoursDTO["weekly"] = {};
  for (const day of DAY_KEYS) {
    const raw = weekly?.[day];
    if (!raw) continue;
    let mapped: HoursDay;
    if (raw.closed) mapped = { closed: true };
    else if (raw.is_24h) mapped = { is24h: true };
    else mapped = { spans: raw.spans ?? [] };
    out[day] = mapped;
  }
  return {
    weekly: out,
    exceptions: exceptions.map((e) => ({ date: e.date, closed: e.closed, spans: e.spans, reason: e.reason })),
    unknown: meta.unknown,
    sellsOutEarly: meta.sellsOutEarly,
    appointmentOnly: meta.appointmentOnly,
    lastOrderOffsetMin: meta.lastOrderOffsetMin,
    timezone: meta.timezone,
  };
}

async function fetchPhotos(
  client: SupabaseClient,
  listingId: string,
  locale: Locale,
): Promise<PhotoDTO[]> {
  const { data } = await client
    .from("listing_media")
    .select("position, media!inner(path, media_locales(locale, alt_text))")
    .eq("listing_id", listingId)
    .eq("media.bucket", "public-photos")
    .eq("media.kind", "photo")
    .eq("media.moderation_status", "approved")
    .order("position");
  type Row = { position: number; media: { path: string; media_locales: { locale: string; alt_text: string }[] } };
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const locales = row.media.media_locales ?? [];
    const localeAlt = locales.find((m) => m.locale === locale)?.alt_text ?? null;
    const enAlt = locales.find((m) => m.locale === "en")?.alt_text ?? null;
    const { text, altIsEnFallback } = resolveAltText(localeAlt, enAlt);
    return { url: publicPhotoUrl(row.media.path), alt: text, altIsEnFallback };
  });
}

async function fetchMenu(
  client: SupabaseClient,
  listingId: string,
  locale: Locale,
): Promise<{ menu: MenuDTO | null; approvedAt: string | null }> {
  const { data: version } = await client
    .from("menu_versions")
    .select("id, menu_documents!inner(listing_id)")
    .eq("menu_documents.listing_id", listingId)
    .eq("status", "active")
    .maybeSingle();
  if (!version) return { menu: null, approvedAt: null };
  const versionId = (version as { id: string }).id;

  // Menu renders in a locale iff THIS locale's version-locale is approved/published.
  const { data: mvl } = await client
    .from("menu_version_locales")
    .select("status, approved_at")
    .eq("menu_version_id", versionId)
    .eq("locale", locale)
    .maybeSingle();
  const status = (mvl as { status: string; approved_at: string | null } | null)?.status;
  if (!status || !["approved", "published"].includes(status)) return { menu: null, approvedAt: null };
  const approvedAt = (mvl as { approved_at: string | null }).approved_at;

  const { data: sectionRows } = await client
    .from("menu_sections")
    .select("id, position, menu_section_locales!inner(name)")
    .eq("menu_version_id", versionId)
    .eq("menu_section_locales.locale", locale)
    .order("position");
  type SectionRow = { id: string; position: number; menu_section_locales: { name: string }[] };
  const sections = ((sectionRows ?? []) as unknown as SectionRow[]);
  if (sections.length === 0) return { menu: null, approvedAt };

  const sectionIds = sections.map((s) => s.id);
  const { data: itemRows } = await client
    .from("menu_items")
    .select("section_id, position, price_cents, currency, price_type, owner_pick, menu_item_locales!inner(name, description)")
    .in("section_id", sectionIds)
    .eq("menu_item_locales.locale", locale)
    .order("position");
  type ItemRow = {
    section_id: string;
    position: number;
    price_cents: number | null;
    currency: string;
    price_type: "fixed" | "market" | "from";
    owner_pick: boolean;
    menu_item_locales: { name: string; description: string | null }[];
  };
  const items = ((itemRows ?? []) as unknown as ItemRow[]);

  const menu: MenuDTO = {
    sections: sections.map((section) => ({
      name: section.menu_section_locales[0]?.name ?? "",
      // items whose requested-locale name is missing are DROPPED (!inner), never
      // filled from EN — the per-locale intersection for menu item names.
      items: items
        .filter((it) => it.section_id === section.id)
        .map((it) => ({
          name: it.menu_item_locales[0]?.name ?? "",
          description: it.menu_item_locales[0]?.description ?? null,
          price: formatMenuItemPrice(
            { priceCents: it.price_cents, currency: it.currency, priceType: it.price_type },
            locale,
          ),
          ownerPick: it.owner_pick,
        })),
    })),
  };
  return { menu, approvedAt };
}

async function fetchFreshness(
  client: SupabaseClient,
  listingId: string,
  locationId: string,
  locale: Locale,
  thresholds: Record<string, number>,
  menuApprovedAt: string | null,
) {
  const { data } = await client
    .from("provenance")
    .select("target_table, field, verified_at, expires_at")
    .eq("is_current", true)
    .eq("approval_status", "approved")
    .or(
      `and(target_table.eq.listings,target_id.eq.${listingId}),and(target_table.eq.locations,target_id.eq.${locationId})`,
    );
  const rows: ProvenanceRow[] = ((data ?? []) as { target_table: string; field: string; verified_at: string; expires_at: string | null }[]).map(
    (r) => ({ targetTable: r.target_table, field: r.field, verifiedAt: r.verified_at, expiresAt: r.expires_at }),
  );
  if (menuApprovedAt) {
    rows.push({ targetTable: "menu_versions", field: "menu", verifiedAt: menuApprovedAt, expiresAt: null });
  }
  return computeFreshness(rows, thresholds, new Date(), locale);
}

export async function getListingDTO(
  client: SupabaseClient,
  locale: Locale,
  listingId: string,
): Promise<ListingDTO | null> {
  if (!(await isEligible(client, listingId, locale))) return null;

  const { data: listing } = await client
    .from("listings")
    .select("id, price_band, primary_category_id, location_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return null;
  const l = listing as { id: string; price_band: string | null; primary_category_id: string; location_id: string };

  const { data: localeRow } = await client
    .from("listing_locales")
    .select("name, slug, seo_title, seo_desc, editorial_note")
    .eq("listing_id", listingId)
    .eq("locale", locale)
    .maybeSingle();
  if (!localeRow) return null;
  const ll = localeRow as { name: string | null; slug: string | null; seo_title: string | null; seo_desc: string | null; editorial_note: string | null };

  const { data: locationRow } = await client
    .from("locations")
    .select("address, phone, geo_lat, geo_lng, operational_status, timezone, market_id")
    .eq("id", l.location_id)
    .maybeSingle();
  if (!locationRow) return null;
  const loc = locationRow as {
    address: { street?: string; city?: string; region?: string; postal_code?: string; country?: string } | null;
    phone: string | null;
    geo_lat: number | null;
    geo_lng: number | null;
    operational_status: string;
    timezone: string;
    market_id: string;
  };
  if (EXCLUDED_OPERATIONAL.has(loc.operational_status)) return null;

  const { data: primaryCatRow } = await client
    .from("category_locales")
    .select("label, slug")
    .eq("category_id", l.primary_category_id)
    .eq("locale", locale)
    .maybeSingle();
  if (!primaryCatRow) return null;
  const primaryCategory = primaryCatRow as CategoryRef;

  // Secondary categories: publicly visible + active + has a locale label (hidden
  // Activities subtree never appears). Primary excluded (it is the breadcrumb).
  const { data: lcRows } = await client
    .from("listing_categories")
    .select("category_id")
    .eq("listing_id", listingId);
  const secondaryIds = ((lcRows ?? []) as { category_id: string }[])
    .map((r) => r.category_id)
    .filter((id) => id !== l.primary_category_id);
  let secondaryCategories: CategoryRef[] = [];
  if (secondaryIds.length > 0) {
    const { data: secRows } = await client
      .from("categories")
      .select("id, category_locales!inner(label, slug)")
      .in("id", secondaryIds)
      .eq("active", true)
      .eq("publicly_visible", true)
      .eq("category_locales.locale", locale);
    type SecRow = { id: string; category_locales: { label: string; slug: string }[] };
    secondaryCategories = ((secRows ?? []) as unknown as SecRow[])
      .map((r) => r.category_locales[0])
      .filter((c): c is { label: string; slug: string } => Boolean(c))
      .map((c) => ({ label: c.label, slug: c.slug }));
  }

  const { data: hoursRow } = await client
    .from("hours_sets")
    .select("weekly, last_order_offset_min, sells_out_early, appointment_only, unknown")
    .eq("location_id", l.location_id)
    .maybeSingle();
  const hs = (hoursRow ?? { weekly: {}, last_order_offset_min: null, sells_out_early: false, appointment_only: false, unknown: true }) as {
    weekly: Record<string, { closed?: boolean; is_24h?: boolean; spans?: { open: string; close: string }[] }>;
    last_order_offset_min: number | null;
    sells_out_early: boolean;
    appointment_only: boolean;
    unknown: boolean;
  };
  const { data: exRows } = await client
    .from("hours_exceptions")
    .select("date, closed, spans, reason")
    .eq("location_id", l.location_id)
    .order("date");
  const hours = toHoursDTO(hs.weekly, (exRows ?? []) as { date: string; closed: boolean; spans: { open: string; close: string }[] | null; reason: string | null }[], {
    unknown: hs.unknown,
    sellsOutEarly: hs.sells_out_early,
    appointmentOnly: hs.appointment_only,
    lastOrderOffsetMin: hs.last_order_offset_min,
    timezone: loc.timezone,
  });

  const photos = await fetchPhotos(client, listingId, locale);
  const { menu, approvedAt } = await fetchMenu(client, listingId, locale);
  const config = await loadAppConfig(client);
  const provenance = await fetchFreshness(
    client,
    listingId,
    l.location_id,
    locale,
    config.staleness_thresholds_days,
    approvedAt,
  );

  const seo = resolveSeo({
    localeTitle: ll.seo_title,
    localeDescription: ll.seo_desc,
    name: resolveName(ll.name),
    categoryLabel: primaryCategory.label,
    marketId: loc.market_id,
    locale,
  });

  return {
    id: l.id,
    locale,
    name: resolveName(ll.name),
    slug: ll.slug as string,
    seo,
    editorialNote: resolveEditorialNote(ll.editorial_note),
    priceBand: l.price_band,
    primaryCategory,
    secondaryCategories,
    address: {
      street: loc.address?.street ?? null,
      city: loc.address?.city ?? null,
      region: loc.address?.region ?? null,
      postalCode: loc.address?.postal_code ?? null,
      country: loc.address?.country ?? null,
    },
    phone: loc.phone,
    geo: loc.geo_lat != null && loc.geo_lng != null ? { lat: loc.geo_lat, lng: loc.geo_lng } : null,
    operationalStatus: loc.operational_status,
    hours,
    photos,
    menu,
    provenance,
  };
}

/** Resolve a listing slug: canonical hit, single-hop alias redirect, or not found. */
export async function resolveListingSlug(
  client: SupabaseClient,
  locale: Locale,
  slug: string,
): Promise<SlugResolution> {
  const { data: canonical } = await client
    .from("listing_locales")
    .select("listing_id")
    .eq("locale", locale)
    .eq("slug", slug)
    .maybeSingle();
  if (canonical) {
    const listingId = (canonical as { listing_id: string }).listing_id;
    return (await isEligible(client, listingId, locale))
      ? { kind: "canonical", listingId }
      : { kind: "not_found" };
  }

  const { data: alias } = await client
    .from("slug_aliases")
    .select("target_id")
    .eq("route_scope", "listing")
    .eq("locale", locale)
    .eq("alias_slug", slug)
    .maybeSingle();
  if (!alias) return { kind: "not_found" };
  const targetId = (alias as { target_id: string }).target_id;

  // Re-gate the alias target through the eligible set — an alias has no publication
  // predicate, so a resolved-but-not-eligible target 404s (never a 301 loop).
  if (!(await isEligible(client, targetId, locale))) return { kind: "not_found" };
  const { data: target } = await client
    .from("listing_locales")
    .select("slug")
    .eq("listing_id", targetId)
    .eq("locale", locale)
    .maybeSingle();
  const canonicalSlug = (target as { slug: string | null } | null)?.slug;
  if (!canonicalSlug) return { kind: "not_found" };
  return { kind: "redirect", to: listingPath(locale, canonicalSlug) };
}

/** Resolve a category slug to its id (canonical or single-hop alias redirect). */
export async function resolveCategorySlug(
  client: SupabaseClient,
  locale: Locale,
  slug: string,
): Promise<{ kind: "canonical"; categoryId: string } | { kind: "redirect"; to: string } | { kind: "not_found" }> {
  const { data: canonical } = await client
    .from("category_locales")
    .select("category_id")
    .eq("locale", locale)
    .eq("slug", slug)
    .maybeSingle();
  if (canonical) return { kind: "canonical", categoryId: (canonical as { category_id: string }).category_id };

  const { data: alias } = await client
    .from("slug_aliases")
    .select("target_id")
    .eq("route_scope", "category")
    .eq("locale", locale)
    .eq("alias_slug", slug)
    .maybeSingle();
  if (!alias) return { kind: "not_found" };
  const targetId = (alias as { target_id: string }).target_id;
  const { data: target } = await client
    .from("category_locales")
    .select("slug")
    .eq("category_id", targetId)
    .eq("locale", locale)
    .maybeSingle();
  const canonicalSlug = (target as { slug: string | null } | null)?.slug;
  if (!canonicalSlug) return { kind: "not_found" };
  return { kind: "redirect", to: categoryPath(locale, canonicalSlug) };
}

/** Primary-category listing ids that are eligible in this locale, keyed by category. */
async function eligibleByPrimaryCategory(
  client: SupabaseClient,
  locale: Locale,
): Promise<Map<string, string[]>> {
  const eligible = (await listEligiblePages(client)).filter((p) => p.locale === locale);
  const ids = eligible.map((p) => p.listingId);
  const byCategory = new Map<string, string[]>();
  if (ids.length === 0) return byCategory;
  const { data } = await client
    .from("listings")
    .select("id, primary_category_id")
    .in("id", ids);
  for (const row of (data ?? []) as { id: string; primary_category_id: string }[]) {
    const list = byCategory.get(row.primary_category_id) ?? [];
    list.push(row.id);
    byCategory.set(row.primary_category_id, list);
  }
  return byCategory;
}

async function toCard(client: SupabaseClient, locale: Locale, listingId: string): Promise<ListingCardDTO | null> {
  const { data: listing } = await client
    .from("listings")
    .select("price_band, primary_category_id, location_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return null;
  const l = listing as { price_band: string | null; primary_category_id: string; location_id: string };
  const { data: localeRow } = await client
    .from("listing_locales")
    .select("name, slug")
    .eq("listing_id", listingId)
    .eq("locale", locale)
    .maybeSingle();
  if (!localeRow) return null;
  const ll = localeRow as { name: string | null; slug: string | null };
  const { data: catRow } = await client
    .from("category_locales")
    .select("label")
    .eq("category_id", l.primary_category_id)
    .eq("locale", locale)
    .maybeSingle();
  const { data: cityRow } = await client
    .from("locations")
    .select("address")
    .eq("id", l.location_id)
    .maybeSingle();
  const city = (cityRow as { address: { city?: string } | null } | null)?.address?.city ?? null;
  const photos = await fetchPhotos(client, listingId, locale);
  return {
    slug: ll.slug as string,
    name: resolveName(ll.name),
    priceBand: l.price_band,
    primaryCategoryLabel: (catRow as { label: string } | null)?.label ?? "",
    photo: photos[0] ? { url: photos[0].url, alt: photos[0].alt } : null,
    neighborhood: city,
  };
}

export async function getCategoryDTO(
  client: SupabaseClient,
  locale: Locale,
  categorySlug: string,
): Promise<CategoryDTO | null> {
  const resolved = await resolveCategorySlug(client, locale, categorySlug);
  if (resolved.kind !== "canonical") return null;

  const { data: cat } = await client
    .from("categories")
    .select("id, active, publicly_visible, category_locales!inner(label, slug)")
    .eq("id", resolved.categoryId)
    .eq("active", true)
    .eq("publicly_visible", true)
    .eq("category_locales.locale", locale)
    .maybeSingle();
  if (!cat) return null;
  const label = (cat as { category_locales: { label: string }[] }).category_locales[0]?.label;
  if (!label) return null;

  const byCategory = await eligibleByPrimaryCategory(client, locale);
  const listingIds = byCategory.get(resolved.categoryId) ?? [];
  if (listingIds.length === 0) return null; // zero-listing category ⇒ 404

  const cards = (await Promise.all(listingIds.map((id) => toCard(client, locale, id)))).filter(
    (c): c is ListingCardDTO => c !== null,
  );
  cards.sort((a, b) => a.name.localeCompare(b.name));
  return { slug: categorySlug, label, listings: cards };
}

export async function getHomeDTO(client: SupabaseClient, locale: Locale): Promise<HomeDTO> {
  const byCategory = await eligibleByPrimaryCategory(client, locale);
  const categories = [];
  for (const [categoryId, ids] of byCategory) {
    const { data: cat } = await client
      .from("categories")
      .select("id, sort, active, publicly_visible, category_locales!inner(label, slug)")
      .eq("id", categoryId)
      .eq("active", true)
      .eq("publicly_visible", true)
      .eq("category_locales.locale", locale)
      .maybeSingle();
    if (!cat) continue;
    const c = cat as { sort: number; category_locales: { label: string; slug: string }[] };
    const cl = c.category_locales[0];
    if (!cl?.label || !cl?.slug) continue;
    categories.push({ slug: cl.slug, label: cl.label, count: ids.length, sort: c.sort });
  }
  categories.sort((a, b) => a.sort - b.sort);
  return { categories: categories.map(({ slug, label, count }) => ({ slug, label, count })) };
}

/** Sitemap rows: home + eligible category + listing pages, publishable only, no aliases, no KO. */
export async function getSitemapRows(client: SupabaseClient): Promise<SitemapRow[]> {
  const served = [...(await getServedLocaleSet(client))];
  const rows: SitemapRow[] = [];

  for (const locale of served) {
    rows.push({ path: homePath(locale), locale });
    const home = await getHomeDTO(client, locale);
    for (const cat of home.categories) {
      rows.push({ path: categoryPath(locale, cat.slug), locale });
    }
  }

  const eligible = await listEligiblePages(client);
  for (const { listingId, locale } of eligible) {
    const { data: localeRow } = await client
      .from("listing_locales")
      .select("slug")
      .eq("listing_id", listingId)
      .eq("locale", locale)
      .maybeSingle();
    const slug = (localeRow as { slug: string | null } | null)?.slug;
    if (slug) rows.push({ path: listingPath(locale, slug), locale });
  }
  return rows;
}

/** generateStaticParams source for listing pages. */
export async function listEligibleListingParams(
  client: SupabaseClient,
): Promise<{ locale: Locale; listingSlug: string }[]> {
  const eligible = await listEligiblePages(client);
  const params: { locale: Locale; listingSlug: string }[] = [];
  for (const { listingId, locale } of eligible) {
    const { data: localeRow } = await client
      .from("listing_locales")
      .select("slug")
      .eq("listing_id", listingId)
      .eq("locale", locale)
      .maybeSingle();
    const slug = (localeRow as { slug: string | null } | null)?.slug;
    if (slug) params.push({ locale, listingSlug: slug });
  }
  return params;
}

/** generateStaticParams source for category pages. */
export async function listEligibleCategoryParams(
  client: SupabaseClient,
): Promise<{ locale: Locale; categorySlug: string }[]> {
  const served = [...(await getServedLocaleSet(client))];
  const params: { locale: Locale; categorySlug: string }[] = [];
  for (const locale of served) {
    const home = await getHomeDTO(client, locale);
    for (const cat of home.categories) params.push({ locale, categorySlug: cat.slug });
  }
  return params;
}
