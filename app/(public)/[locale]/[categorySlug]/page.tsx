import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/locales";
import { getCategoryDTO, listEligibleCategoryParams } from "@/lib/public-read/server";
import { listingPath } from "@/lib/public-read/paths";

/**
 * Category page (CP4). Minimal scaffold in Unit E; the designed cards + breadcrumbs land
 * in Unit F. Zero-listing / hidden / missing-locale categories 404 (getCategoryDTO → null).
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  return listEligibleCategoryParams();
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; categorySlug: string }>;
}) {
  const { locale, categorySlug } = await params;
  if (!isLocale(locale)) notFound();
  const category = await getCategoryDTO(locale, categorySlug);
  if (!category) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">{category.label}</h1>
      <ul className="mt-6 flex flex-col gap-2">
        {category.listings.map((listing) => (
          <li key={listing.slug}>
            <Link className="text-teal hover:text-teal-dark" href={listingPath(locale, listing.slug)}>
              {listing.name}
              {listing.priceBand ? ` · ${listing.priceBand}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
