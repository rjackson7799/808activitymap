import { absoluteUrl } from "@/lib/public-read/paths";

/**
 * schema.org BreadcrumbList JSON-LD (CP4). Pairs with the on-page breadcrumb trail
 * (Home › Category › Listing). Items are given as public-path + origin; the last item is
 * the current page (kept with its URL — valid, and simplest).
 */
export function breadcrumbJsonLd(
  crumbs: { name: string; path: string }[],
  opts: { origin: string },
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(opts.origin, crumb.path),
    })),
  };
}
