import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/config/env";
import { SiteHeader } from "@/components/public/SiteHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicEmptyState } from "@/components/public/PublicEmptyState";
import { ListingCard } from "@/components/public/ListingCard";
import { isLocale, type Locale } from "@/lib/locales";
import { ui } from "@/lib/i18n/ui";
import { todayUi } from "@/lib/i18n/today";
import { localeAlternatesMeta } from "@/lib/public-read/metadata";
import { todayPath, toOrigin } from "@/lib/public-read/paths";
import { getServedLocales, getTodayDTO } from "@/lib/public-read/server";
import type { LocaleAlternate } from "@/lib/public-read/queries";

export const revalidate = 3600;

async function alternates(): Promise<LocaleAlternate[]> {
  return (await getServedLocales()).map((locale) => ({ locale, href: todayPath(locale), available: true }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [edition, alts] = await Promise.all([getTodayDTO(locale), alternates()]);
  const strings = todayUi(locale);
  return {
    title: `${edition?.title ?? strings.pageTitle} | ${env().BRAND_NAME}`,
    description: edition?.dek ?? strings.pageDescription,
    alternates: localeAlternatesMeta(toOrigin(env().PORTAL_DOMAIN), todayPath(locale), alts),
    ...(env().APP_ENV === "staging" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [edition, alts] = await Promise.all([getTodayDTO(locale), alternates()]);
  const chrome = ui(locale);
  const strings = todayUi(locale);
  const brand = env().BRAND_NAME;

  return <>
    <SiteHeader locale={locale} brand={brand} alternates={alts} notAvailableLabel={chrome.otherLocaleNotAvailable} languageLabel={chrome.languageLabel} />
    <main id="main-content" className="public-page">
      <section className="border-b border-hairline bg-[var(--gradient-backdrop)]">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="eyebrow">{strings.eyebrow}</p>
          <h1 className="mt-3 max-w-4xl font-serif text-[2.25rem] leading-[1.12] text-ink sm:text-[3.35rem]">{edition?.title ?? strings.pageTitle}</h1>
          <p className="mt-5 max-w-3xl text-[15px] leading-[1.75] text-body sm:text-base">{edition?.dek ?? strings.pageDescription}</p>
          {edition ? <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-secondary">{strings.issueLabel(formatWeek(edition.weekOf, locale))}</p> : null}
        </div>
      </section>

      {edition ? <>
        <article data-analytics="today-note" data-note-id={edition.id} className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="rounded-card border border-terracotta/20 bg-warning-bg p-6 shadow-card sm:p-9">
            <div className="space-y-5 font-serif text-[1.05rem] leading-8 text-ink sm:text-[1.15rem]">
              {edition.body.split(/\n{2,}/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </div>
        </article>
        <section aria-labelledby="today-shortlist" className="border-t border-hairline bg-shell">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
            <div className="max-w-2xl">
              <p className="eyebrow">{brand}</p>
              <h2 id="today-shortlist" className="mt-2 font-serif text-3xl text-ink">{strings.shortlistTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-secondary">{strings.shortlistIntro}</p>
            </div>
            <ul className="mt-7 grid gap-5 lg:grid-cols-2">
              {edition.listings.map((listing) => <li key={listing.id}><ListingCard locale={locale} viewDetailsLabel={chrome.viewDetails} listing={{ slug: listing.slug, name: listing.name, priceBand: listing.priceBand, primaryCategoryLabel: listing.primaryCategory.label, photo: listing.photo ? { url: listing.photo.url, alt: listing.photo.alt } : null, neighborhood: listing.neighborhood }} /></li>)}
            </ul>
          </div>
        </section>
      </> : <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16"><PublicEmptyState title={strings.emptyTitle} body={strings.emptyBody} /></div>}
    </main>
    <PublicFooter brand={brand} strings={chrome} locale={locale} />
  </>;
}

function formatWeek(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale === "ja" ? "ja-JP" : "ko-KR", { dateStyle: "long", timeZone: "Pacific/Honolulu" }).format(new Date(`${value}T12:00:00-10:00`));
}
