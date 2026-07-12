import { DEFAULT_LOCALE, type Locale } from "@/lib/locales";

/**
 * Public URL path builders (CP4, D3). EN is served at the root; other locales are
 * prefixed (`/ja`, `/ko` later). Listings live under a dedicated `/spot/` segment so
 * category and listing slugs (separately unique in the schema) never collide. Slugs
 * are stored decoded (native script); percent-encoding for absolute sitemap URLs is
 * applied at that boundary, not here.
 */

export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

export function homePath(locale: Locale): string {
  return localePrefix(locale) || "/";
}

export function categoryPath(locale: Locale, slug: string): string {
  return `${localePrefix(locale)}/${slug}`;
}

export function listingPath(locale: Locale, slug: string): string {
  return `${localePrefix(locale)}/spot/${slug}`;
}
