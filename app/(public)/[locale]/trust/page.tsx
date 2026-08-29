import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/config/env";
import { isLocale } from "@/lib/locales";
import { ui } from "@/lib/i18n/ui";
import { trustUi } from "@/lib/i18n/trust";
import { getServedLocales } from "@/lib/public-read/server";
import { homePath, trustPath, toOrigin } from "@/lib/public-read/paths";
import { localeAlternatesMeta } from "@/lib/public-read/metadata";
import type { LocaleAlternate } from "@/lib/public-read/queries";
import { SiteHeader } from "@/components/public/SiteHeader";
import { PublicFooter } from "@/components/public/PublicFooter";

async function alternates(): Promise<LocaleAlternate[]> {
  return (await getServedLocales()).map((locale) => ({ locale, href: trustPath(locale), available: true }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const origin = toOrigin(env().PORTAL_DOMAIN);
  return {
    title: `${trustUi(locale).trustTitle} | ${env().BRAND_NAME}`,
    description: trustUi(locale).trustIntro,
    alternates: localeAlternatesMeta(origin, trustPath(locale), await alternates()),
    ...(env().APP_ENV === "staging" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function TrustPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [alts] = await Promise.all([alternates()]);
  const chrome = ui(locale);
  const strings = trustUi(locale);
  const brand = env().BRAND_NAME;
  const cards = [
    [strings.verifyTitle, strings.verifyBody],
    [strings.correctionsTitle, strings.correctionsBody],
    [strings.slaTitle, strings.slaBody],
    [strings.privacyTitle, strings.privacyBody],
  ];
  return <>
    <SiteHeader locale={locale} brand={brand} alternates={alts} notAvailableLabel={chrome.otherLocaleNotAvailable} languageLabel={chrome.languageLabel} />
    <main id="main-content" className="public-page">
      <section className="border-b border-hairline bg-[var(--gradient-backdrop)]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="eyebrow">{brand}</p>
          <h1 className="mt-3 max-w-3xl font-serif text-[2.25rem] leading-tight text-ink sm:text-[3.1rem]">{strings.trustTitle}</h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-[1.75] text-body">{strings.trustIntro}</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-4xl gap-4 px-4 py-10 sm:grid-cols-2 sm:px-6 sm:py-14">
        {cards.map(([title, body]) => <article key={title} className="rounded-card border border-hairline bg-surface p-6 shadow-card"><h2 className="font-serif text-xl text-ink">{title}</h2><p className="mt-3 text-[14px] leading-[1.7] text-body">{body}</p></article>)}
        <p className="sm:col-span-2 mt-2"><a href={homePath(locale)} className="inline-flex min-h-11 items-center rounded-cta bg-ink px-5 text-[13px] font-bold text-white">{strings.correctionsCta}</a></p>
      </section>
    </main>
    <PublicFooter brand={brand} strings={chrome} locale={locale} />
  </>;
}

