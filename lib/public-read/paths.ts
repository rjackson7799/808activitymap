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

/**
 * Decode a route-param slug for DB lookup. Next delivers non-ASCII dynamic segments
 * percent-encoded (e.g. JA native-script slugs), while slugs are stored decoded/NFC — so
 * a page must decode before querying. Idempotent for ASCII (no `%` to decode) and safe
 * against malformed sequences.
 */
export function decodeSlug(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

/**
 * Detect malformed percent-encoding across the transport and framework decode
 * boundaries. A browser-safe request may encode an already malformed segment
 * (for example `%25E0%25A4%25A`); the first pass is valid, but the value Next
 * subsequently decodes is not. Checking both passes keeps that request on the
 * ordinary not-found path instead of allowing the router to raise a 500.
 */
export function hasMalformedPercentEncoding(param: string): boolean {
  let value = param;
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return true;
    }
  }
  return false;
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

export function trustPath(locale: Locale): string {
  return `${localePrefix(locale)}/trust`;
}

export function reportChangePath(locale: Locale, listingId?: string): string {
  const base = `${localePrefix(locale)}/report-change`;
  return listingId ? `${base}?listing=${encodeURIComponent(listingId)}` : base;
}

/**
 * Absolute URL for canonicals, hreflang, sitemaps, and JSON-LD. `origin` is derived from
 * PORTAL_DOMAIN (never the request/staging host). Native-script path segments are
 * percent-encoded here — the one place encoding happens.
 */
export function absoluteUrl(origin: string, path: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${encodeURI(path)}`;
}

/** Normalize a PORTAL_DOMAIN value (with or without scheme) to an https origin. */
export function toOrigin(portalDomain: string): string {
  if (/^https?:\/\//.test(portalDomain)) return portalDomain.replace(/\/$/, "");
  return `https://${portalDomain.replace(/\/$/, "")}`;
}
