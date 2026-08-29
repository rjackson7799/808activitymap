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
import { breadcrumbJsonLd, categoryItemListJsonLd, serializeJsonLd } from "@/lib/schema";
import { SiteHeader } from "@/components/public/SiteHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { ListingCard } from "@/components/public/ListingCard";

export const dynamicParams = true;
export const revalidate = 3600;

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
  const origin = toOrigin(env().PORTAL_DOMAIN);
  const breadcrumbsLd = breadcrumbJsonLd([
    { name: strings.home, path: homePath(locale) },
    { name: category.label, path: categoryPath(locale, category.slug) },
  ], { origin });
  const itemListLd = categoryItemListJsonLd(category, { origin, locale });

  return (
    <>
      <SiteHeader
        locale={locale}
        brand={brand}
        alternates={alternates}
        notAvailableLabel={strings.otherLocaleNotAvailable}
        languageLabel={strings.languageLabel}
      />
      <main id="main-content" className="public-page">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <Breadcrumbs items={[{ name: strings.home, href: homePath(locale) }, { name: category.label }]} />
          <div className="mt-5 max-w-2xl">
            <p className="eyebrow">{strings.browse}</p>
            <h1 className="mt-2 font-serif text-[2rem] leading-tight text-ink sm:text-[2.625rem]">{category.label}</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-secondary">{strings.categoryIntro(category.label, category.listings.length)}</p>
          </div>
        <ul className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {category.listings.map((listing) => (
            <li key={listing.slug}>
              <ListingCard locale={locale} listing={listing} viewDetailsLabel={strings.viewDetails} />
            </li>
          ))}
        </ul>
        </div>
      </main>
      <PublicFooter brand={brand} strings={strings} locale={locale} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbsLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListLd) }} />
      <script src="/image-fallback.js" defer />
    </>
  );
}
