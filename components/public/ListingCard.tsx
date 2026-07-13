import Link from "next/link";
import type { Locale } from "@/lib/locales";
import type { ListingCardDTO } from "@/lib/public-read/dto";
import { listingPath } from "@/lib/public-read/paths";

/**
 * Listing card (CP4). Photo-forward with a warm gradient placeholder — real vendor photos
 * (never stock, PRD §8) + next/image arrive in a later slice; CP4 fixtures carry no image
 * files. No rating stars (reviews are a later slice). CJK-length-tolerant.
 */
export function ListingCard({ locale, listing }: { locale: Locale; listing: ListingCardDTO }) {
  return (
    <Link
      href={listingPath(locale, listing.slug)}
      className="group block overflow-hidden rounded-card border border-hairline bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="photo-placeholder aspect-[1.7/1] w-full" aria-hidden />
      <div className="p-4">
        <h2 className="font-sans text-[15.5px] font-bold leading-snug text-ink">{listing.name}</h2>
        <p className="mt-1 text-[12.5px] text-secondary">
          {[listing.primaryCategoryLabel, listing.priceBand, listing.neighborhood]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Link>
  );
}
