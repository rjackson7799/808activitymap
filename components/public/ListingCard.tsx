import Link from "next/link";
import type { Locale } from "@/lib/locales";
import type { ListingCardDTO } from "@/lib/public-read/dto";
import { listingPath } from "@/lib/public-read/paths";
import { PublicImage } from "./PublicImage";

/**
 * Listing card (CP4). Photo-forward with a warm gradient placeholder — real vendor photos
 * (never stock, PRD §8) + next/image arrive in a later slice; CP4 fixtures carry no image
 * files. No rating stars (reviews are a later slice). CJK-length-tolerant.
 */
export function ListingCard({ locale, listing, viewDetailsLabel }: { locale: Locale; listing: ListingCardDTO; viewDetailsLabel: string }) {
  return (
    <Link
      href={listingPath(locale, listing.slug)}
      className="group grid h-full overflow-hidden rounded-card border border-hairline bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-lift sm:grid-cols-[9rem_1fr]"
    >
      <div className="photo-placeholder relative aspect-[1.7/1] w-full overflow-hidden sm:aspect-auto sm:min-h-32">
        {listing.photo ? (
          <PublicImage
            src={listing.photo.url}
            alt={listing.photo.alt ?? ""}
            sizes="(max-width: 639px) 100vw, 144px"
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col justify-center p-4 sm:p-5">
        <h2 className="font-sans text-base font-bold leading-snug text-ink">{listing.name}</h2>
        <p className="mt-2 text-[12px] font-semibold leading-relaxed text-secondary">
          {[listing.primaryCategoryLabel, listing.priceBand, listing.neighborhood]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <span className="mt-4 inline-flex min-h-9 w-fit items-center rounded-cta border border-teal px-3 text-[12px] font-bold text-teal-dark transition group-hover:bg-info-bg">
          <span aria-hidden>＋</span>
          <span className="ml-1">{viewDetailsLabel}</span>
        </span>
      </div>
    </Link>
  );
}
