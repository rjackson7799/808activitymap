import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/config/env";
import { isLocale } from "@/lib/locales";
import { ui } from "@/lib/i18n/ui";
import { trustUi } from "@/lib/i18n/trust";
import { getListingDTO, getServedLocales } from "@/lib/public-read/server";
import { homePath, reportChangePath } from "@/lib/public-read/paths";
import type { LocaleAlternate } from "@/lib/public-read/queries";
import { SiteHeader } from "@/components/public/SiteHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { CorrectionForm } from "@/components/public/CorrectionForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return { robots: { index: false, follow: false } };
  return {
    title: `${trustUi(locale).reportTitle} | ${env().BRAND_NAME}`,
    robots: { index: false, follow: true },
  };
}

async function alternates(): Promise<LocaleAlternate[]> {
  return (await getServedLocales()).map((locale) => ({ locale, href: reportChangePath(locale), available: true }));
}

export default async function ReportChangePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ listing?: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const listingId = (await searchParams).listing;
  const [alts, listing] = await Promise.all([alternates(), listingId ? getListingDTO(locale, listingId) : Promise.resolve(null)]);
  const chrome = ui(locale);
  const strings = trustUi(locale);
  const formStrings = {
    fieldLabel: strings.fieldLabel,
    detailsLabel: strings.detailsLabel,
    detailsHint: strings.detailsHint,
    nameLabel: strings.nameLabel,
    emailLabel: strings.emailLabel,
    contactHint: strings.contactHint,
    submit: strings.submit,
    submitting: strings.submitting,
    successMessage: strings.successMessage,
    error: strings.error,
    rateLimited: strings.rateLimited,
    fields: strings.fields,
  };
  const brand = env().BRAND_NAME;
  return <>
    <SiteHeader locale={locale} brand={brand} alternates={alts} notAvailableLabel={chrome.otherLocaleNotAvailable} languageLabel={chrome.languageLabel} />
    <main id="main-content" className="public-page">
      <section className="border-b border-hairline bg-[var(--gradient-backdrop)]">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="eyebrow">{brand}</p>
          <h1 className="mt-3 font-serif text-[2.25rem] leading-tight text-ink sm:text-[3rem]">{strings.reportTitle}</h1>
          {listing && listingId ? (
            <p className="mt-5 max-w-2xl text-[15px] leading-[1.75] text-body">{strings.reportIntro(listing.name)}</p>
          ) : null}
        </div>
      </section>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {listing && listingId ? (
          <div className="rounded-card border border-hairline-strong bg-surface p-5 shadow-card sm:p-8">
            <CorrectionForm listingId={listingId} locale={locale} strings={formStrings} />
          </div>
        ) : (
          <div className="rounded-card border border-hairline-strong bg-surface p-6 shadow-card sm:p-8">
            <p className="text-[14px] leading-[1.75] text-body">{strings.reportNeedsListing}</p>
            <p className="mt-6">
              <a href={homePath(locale)} className="inline-flex min-h-11 items-center rounded-cta bg-ink px-5 text-[13px] font-bold text-white transition hover:bg-ink-soft">
                {strings.backToBrowse}
              </a>
            </p>
          </div>
        )}
      </div>
    </main>
    <PublicFooter brand={brand} strings={chrome} locale={locale} />
  </>;
}
