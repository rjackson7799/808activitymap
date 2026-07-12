import { notFound, permanentRedirect } from "next/navigation";
import { isLocale } from "@/lib/locales";
import {
  getListingDTO,
  listAliasListingParams,
  listEligibleListingParams,
  resolveListingSlug,
} from "@/lib/public-read/server";

/**
 * Listing page (CP4). Minimal scaffold in Unit E; the designed detail page + JSON-LD land
 * in Unit F. Slug resolution: a romanized alias single-hops to the native-script canonical
 * via a permanent redirect (Next App Router's permanentRedirect is 308 — the method-
 * preserving permanent redirect, SEO-equivalent to the PRD's "301"; recorded as a
 * deviation). A resolved-but-not-eligible target 404s.
 *
 * dynamicParams=false + BOTH canonical and alias slugs in generateStaticParams: aliases
 * bake as static permanent redirects, so nothing renders on-demand (no fallback needed,
 * no DoS surface) and KO stays fenced by the [locale] segment.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const [canonical, aliases] = await Promise.all([
    listEligibleListingParams(),
    listAliasListingParams(),
  ]);
  return [...canonical, ...aliases];
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ locale: string; listingSlug: string }>;
}) {
  const { locale, listingSlug } = await params;
  if (!isLocale(locale)) notFound();

  const resolved = await resolveListingSlug(locale, listingSlug);
  // encodeURI so a native-script canonical path is a valid (ByteString) Location header.
  if (resolved.kind === "redirect") permanentRedirect(encodeURI(resolved.to));
  if (resolved.kind !== "canonical") notFound();

  const listing = await getListingDTO(locale, resolved.listingId);
  if (!listing) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">{listing.name}</h1>
      <p className="mt-2 text-secondary">
        {listing.primaryCategory.label}
        {listing.priceBand ? ` · ${listing.priceBand}` : ""}
      </p>
    </main>
  );
}
