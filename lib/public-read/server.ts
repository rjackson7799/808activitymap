import "server-only";
import { createSupabaseServiceClient } from "@/lib/auth/server";
import type { Locale } from "@/lib/locales";
import * as q from "./queries";

/**
 * Server-bound public read model (CP4). Binds the query functions to a single reusable
 * service-role client (ADR-004) so pages/route handlers don't thread it. The queries
 * module stays client-injected (unit/integration testable); this file is the production
 * entry the App Router imports. Caching (use cache / cacheTag) wraps these in Unit G.
 *
 * The service client is stateless (no session/cookies), so one instance is reused.
 */

let cached: ReturnType<typeof createSupabaseServiceClient> | undefined;
function db() {
  return (cached ??= createSupabaseServiceClient());
}

export const getListingDTO = (locale: Locale, listingId: string) => q.getListingDTO(db(), locale, listingId);
export const getCategoryDTO = (locale: Locale, slug: string) => q.getCategoryDTO(db(), locale, slug);
export const getHomeDTO = (locale: Locale) => q.getHomeDTO(db(), locale);
export const getSitemapRows = () => q.getSitemapRows(db());
export const resolveListingSlug = (locale: Locale, slug: string) => q.resolveListingSlug(db(), locale, slug);
export const resolveCategorySlug = (locale: Locale, slug: string) => q.resolveCategorySlug(db(), locale, slug);
export const listEligibleListingParams = () => q.listEligibleListingParams(db());
export const listAliasListingParams = () => q.listAliasListingParams(db());
export const listEligibleCategoryParams = () => q.listEligibleCategoryParams(db());

export async function getServedLocales(): Promise<Locale[]> {
  return [...(await q.getServedLocaleSet(db()))];
}
