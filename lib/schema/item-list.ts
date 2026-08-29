import type { CategoryDTO } from "@/lib/public-read/dto";
import { absoluteUrl, listingPath } from "@/lib/public-read/paths";

/** Schema.org ItemList for the same reviewed listings rendered on a category page. */
export function categoryItemListJsonLd(
  category: CategoryDTO,
  opts: { origin: string; locale: "en" | "ja" | "ko" },
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: category.label,
    numberOfItems: category.listings.length,
    itemListElement: category.listings.map((listing, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: listing.name,
      url: absoluteUrl(opts.origin, listingPath(opts.locale, listing.slug)),
    })),
  };
}
