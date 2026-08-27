import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/auth/server";
import type { Locale } from "@/lib/locales";
import * as q from "./queries";
import { loadAppConfig } from "./config";
import { TAG_PUBLIC, TAG_SITEMAP, tagForListing } from "./tags";

/**
 * Server-bound + cached public read model (CP4). Binds the query functions to a single
 * reusable service-role client (ADR-004) and wraps the page-data reads in the Data Cache
 * with TAGS, so the CP3 publish/unpublish actions can invalidate them with revalidateTag
 * (a bare supabase-js call does not thread next.tags, so without this the tags would be a
 * no-op — the red-team's finding). Tags: `listing:<id>` (one listing), `sitemap` (the URL
 * set), `public` (everything). Time-based `revalidate` is the stale-while-revalidate
 * safety net (serve last-good on a DB blip; ISR-under-DB-failure runbook).
 *
 * generateStaticParams sources + getServedLocales are intentionally NOT cached (they run
 * at build / in generateStaticParams, where unstable_cache is not appropriate).
 */

const REVALIDATE_SECONDS = 3600;

let cachedClient: ReturnType<typeof createSupabaseServiceClient> | undefined;
function db() {
  return (cachedClient ??= createSupabaseServiceClient());
}

function cached<T>(fn: () => Promise<T>, keyParts: string[], tags: string[]): Promise<T> {
  return unstable_cache(fn, keyParts, { tags, revalidate: REVALIDATE_SECONDS })();
}

export const getListingDTO = (locale: Locale, listingId: string) =>
  cached(() => q.getListingDTO(db(), locale, listingId), ["listing-dto", locale, listingId], [tagForListing(listingId), TAG_PUBLIC]);

export const getListingLocaleAlternates = (listingId: string) =>
  cached(() => q.getListingLocaleAlternates(db(), listingId), ["listing-alt", listingId], [tagForListing(listingId), TAG_PUBLIC]);

export const resolveListingSlug = (locale: Locale, slug: string) =>
  cached(() => q.resolveListingSlug(db(), locale, slug), ["listing-slug", locale, slug], [TAG_PUBLIC]);

export const getCategoryDTO = (locale: Locale, slug: string) =>
  cached(() => q.getCategoryDTO(db(), locale, slug), ["category-dto", locale, slug], [TAG_SITEMAP, TAG_PUBLIC]);

export const getCategoryLocaleAlternates = (categoryId: string) =>
  cached(() => q.getCategoryLocaleAlternates(db(), categoryId), ["category-alt", categoryId], [TAG_SITEMAP, TAG_PUBLIC]);

export const getHomeDTO = (locale: Locale) =>
  cached(() => q.getHomeDTO(db(), locale), ["home-dto", locale], [TAG_SITEMAP, TAG_PUBLIC]);

export const getSitemapRows = () =>
  cached(() => q.getSitemapRows(db()), ["sitemap-rows"], [TAG_SITEMAP, TAG_PUBLIC]);

// Uncached: build-time / generateStaticParams sources + served locales.
export const resolveCategorySlug = (locale: Locale, slug: string) => q.resolveCategorySlug(db(), locale, slug);
export const listEligibleListingParams = () => q.listEligibleListingParams(db());
export const listAliasListingParams = () => q.listAliasListingParams(db());
export const listEligibleCategoryParams = () => q.listEligibleCategoryParams(db());

export async function getServedLocales(): Promise<Locale[]> {
  return [...(await q.getServedLocaleSet(db()))];
}

/** Uncached — keeps the public_surface_enabled kill switch responsive (rollback). */
export const getAppConfig = () => loadAppConfig(db());
