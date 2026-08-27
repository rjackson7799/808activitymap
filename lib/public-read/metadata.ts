import { DEFAULT_LOCALE } from "@/lib/locales";
import type { LocaleAlternate } from "./queries";
import { absoluteUrl } from "./paths";

/**
 * hreflang + canonical metadata (CP4). Emits ABSOLUTE public URLs from the PORTAL_DOMAIN
 * origin (never the internal /en form, never the staging host). hreflang alternates are
 * only the locales where the page genuinely exists (`available`); x-default points at the
 * EN version. KO is absent until locale_availability lists it.
 */
export function localeAlternatesMeta(
  origin: string,
  canonicalPath: string,
  alternates: LocaleAlternate[],
): { canonical: string; languages: Record<string, string> } {
  const languages: Record<string, string> = {};
  for (const alt of alternates) {
    if (alt.available) languages[alt.locale] = absoluteUrl(origin, alt.href);
  }
  const defaultAlt = alternates.find((a) => a.locale === DEFAULT_LOCALE && a.available);
  if (defaultAlt) languages["x-default"] = absoluteUrl(origin, defaultAlt.href);
  return { canonical: absoluteUrl(origin, canonicalPath), languages };
}
