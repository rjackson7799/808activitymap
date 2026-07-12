import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/config/env";
import { isLocale } from "@/lib/locales";
import { ui } from "@/lib/i18n/ui";
import {
  getCategoryDTO,
  getCategoryLocaleAlternates,
  listEligibleCategoryParams,
} from "@/lib/public-read/server";
import { categoryPath, decodeSlug, homePath, toOrigin } from "@/lib/public-read/paths";
import { localeAlternatesMeta } from "@/lib/public-read/metadata";
import { SiteHeader } from "@/components/public/SiteHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { ListingCard } from "@/components/public/ListingCard";

export const dynamicParams = false;

export async function generateStaticParams() {
  return listEligibleCategoryParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; categorySlug: string }>;
}): Promise<Metadata> {
  const { locale, categorySlug } = await params;
  if (!isLocale(locale)) return {};
  const category = await getCategoryDTO(locale, decodeSlug(categorySlug));
  if (!category) return {};
  const origin = toOrigin(env().PORTAL_DOMAIN);
  const alternates = await getCategoryLocaleAlternates(category.id);
  const strings = ui(locale);
  return {
    title: `${category.label} — ${env().BRAND_NAME}`,
    description: `${category.label} · ${strings.browse}`,
    alternates: localeAlternatesMeta(origin, categoryPath(locale, category.slug), alternates),
    ...(env().APP_ENV === "staging" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; categorySlug: string }>;
}) {
  const { locale, categorySlug } = await params;
  if (!isLocale(locale)) notFound();
  const category = await getCategoryDTO(locale, decodeSlug(categorySlug));
  if (!category) notFound();

  const [alternates, strings] = [await getCategoryLocaleAlternates(category.id), ui(locale)];
  const brand = env().BRAND_NAME;

  return (
    <>
      <SiteHeader locale={locale} brand={brand} alternates={alternates} notAvailableLabel={strings.otherLocaleNotAvailable} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Breadcrumbs items={[{ name: strings.home, href: homePath(locale) }, { name: category.label }]} />
        <h1 className="mt-4 font-serif text-4xl text-ink">{category.label}</h1>
        <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {category.listings.map((listing) => (
            <li key={listing.slug}>
              <ListingCard locale={locale} listing={listing} />
            </li>
          ))}
        </ul>
      </main>
      <PublicFooter brand={brand} strings={strings} />
    </>
  );
}
