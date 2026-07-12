import type { HoursDTO, ListingDTO } from "@/lib/public-read/dto";
import { absoluteUrl, listingPath } from "@/lib/public-read/paths";

/**
 * schema.org Restaurant JSON-LD (CP4). Pure render function over the public DTO — it
 * draws ONLY from allowlisted DTO fields, so it structurally cannot emit anything the
 * leakage suite forbids (no provenance internals, no menu-source/evidence, no other
 * locale). Prices are intentionally omitted from menu items: the DTO exposes a formatted
 * display string, not the raw amount schema.org offers want, and menu pricing is not
 * required for the rich result. Wired to the real reference listing (seed A) via goldens.
 */

const DAY_URL: Record<string, string> = {
  mon: "https://schema.org/Monday",
  tue: "https://schema.org/Tuesday",
  wed: "https://schema.org/Wednesday",
  thu: "https://schema.org/Thursday",
  fri: "https://schema.org/Friday",
  sat: "https://schema.org/Saturday",
  sun: "https://schema.org/Sunday",
};
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function openingHoursSpecification(hours: HoursDTO): Record<string, unknown>[] {
  const specs: Record<string, unknown>[] = [];
  for (const day of DAY_ORDER) {
    const entry = hours.weekly[day];
    if (!entry) continue;
    if ("is24h" in entry && entry.is24h) {
      specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: DAY_URL[day], opens: "00:00", closes: "23:59" });
      continue;
    }
    if ("spans" in entry) {
      for (const span of entry.spans) {
        specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: DAY_URL[day], opens: span.open, closes: span.close });
      }
    }
    // closed days emit nothing
  }
  return specs;
}

export function restaurantJsonLd(dto: ListingDTO, opts: { origin: string }): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: dto.name,
    url: absoluteUrl(opts.origin, listingPath(dto.locale, dto.slug)),
    inLanguage: dto.locale,
  };

  if (dto.photos.length > 0) node.image = dto.photos.map((p) => p.url);

  node.address = {
    "@type": "PostalAddress",
    streetAddress: dto.address.street,
    addressLocality: dto.address.city,
    addressRegion: dto.address.region,
    postalCode: dto.address.postalCode,
    addressCountry: dto.address.country,
  };
  if (dto.phone) node.telephone = dto.phone;
  if (dto.priceBand) node.priceRange = dto.priceBand;
  if (dto.geo) node.geo = { "@type": "GeoCoordinates", latitude: dto.geo.lat, longitude: dto.geo.lng };

  const cuisines = [dto.primaryCategory.label, ...dto.secondaryCategories.map((c) => c.label)];
  if (cuisines.length > 0) node.servesCuisine = cuisines;

  const ohs = openingHoursSpecification(dto.hours);
  if (ohs.length > 0) node.openingHoursSpecification = ohs;

  if (dto.menu) {
    node.hasMenu = {
      "@type": "Menu",
      inLanguage: dto.locale,
      hasMenuSection: dto.menu.sections.map((section) => ({
        "@type": "MenuSection",
        name: section.name,
        hasMenuItem: section.items.map((item) => {
          const menuItem: Record<string, unknown> = { "@type": "MenuItem", name: item.name };
          if (item.description) menuItem.description = item.description;
          return menuItem;
        }),
      })),
    };
  }

  return node;
}
