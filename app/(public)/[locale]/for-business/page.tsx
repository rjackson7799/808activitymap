import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Languages, Scale, ShieldCheck, type LucideIcon } from "lucide-react";
import { env } from "@/config/env";
import { businessUi } from "@/lib/i18n/business";
import { ui } from "@/lib/i18n/ui";
import { isLocale } from "@/lib/locales";
import { localeAlternatesMeta } from "@/lib/public-read/metadata";
import { forBusinessPath, toOrigin } from "@/lib/public-read/paths";
import { getServedLocales } from "@/lib/public-read/server";
import type { LocaleAlternate } from "@/lib/public-read/queries";
import { BusinessInquiryForm } from "@/components/public/BusinessInquiryForm";
import { PublicFooter } from "@/components/public/PublicFooter";
import { SiteHeader } from "@/components/public/SiteHeader";

async function alternates(): Promise<LocaleAlternate[]> {
  return (await getServedLocales())
    .filter((locale) => locale === "en" || locale === "ja")
    .map((locale) => ({ locale, href: forBusinessPath(locale), available: true }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || locale === "ko") return {};
  const strings = businessUi(locale);
  return {
    title: `${strings.link} | ${env().BRAND_NAME}`,
    description: strings.intro,
    alternates: localeAlternatesMeta(toOrigin(env().PORTAL_DOMAIN), forBusinessPath(locale), await alternates()),
    ...(env().APP_ENV === "staging" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function ForBusinessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale) || locale === "ko") notFound();
  const [alts] = await Promise.all([alternates()]);
  const strings = businessUi(locale);
  const chrome = ui(locale);
  const brand = env().BRAND_NAME;
  const icons: LucideIcon[] = [ShieldCheck, Languages, Scale];

  return <>
    <SiteHeader locale={locale} brand={brand} alternates={alts} notAvailableLabel={chrome.otherLocaleNotAvailable} languageLabel={chrome.languageLabel} />
    <main id="main-content" className="public-page">
      <section className="border-b border-hairline bg-[var(--gradient-backdrop)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,.8fr)] lg:items-end">
          <div>
            <p className="eyebrow">{strings.eyebrow}</p>
            <h1 className="mt-3 max-w-4xl font-serif text-[2.35rem] leading-[1.08] text-ink sm:text-[3.4rem]">{strings.title}</h1>
            <p className="mt-6 max-w-2xl text-[15px] leading-[1.8] text-body">{strings.intro}</p>
          </div>
          <div className="rounded-card border border-terracotta/20 bg-warning-bg p-5 shadow-card sm:p-6">
            <CheckCircle2 className="h-6 w-6 text-terracotta-deep" aria-hidden />
            <p className="mt-4 text-[14px] leading-7 text-ink">{strings.trustNote}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="business-benefits-heading">
        <h2 id="business-benefits-heading" className="font-serif text-3xl text-ink">{strings.benefitsHeading}</h2>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {strings.benefits.map((benefit, index) => {
            const Icon = icons[index] ?? ShieldCheck;
            return (
              <article key={benefit.title} className="rounded-card border border-hairline-strong bg-white p-6 shadow-card">
                <span className="grid size-10 place-items-center rounded-full bg-info-bg text-teal-dark" aria-hidden><Icon size={20} /></span>
                <h3 className="mt-5 font-serif text-xl leading-snug text-ink">{benefit.title}</h3>
                <p className="mt-3 text-[14px] leading-7 text-body">{benefit.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-hairline bg-white" aria-labelledby="business-process-heading">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-3xl">
            <h2 id="business-process-heading" className="font-serif text-3xl text-ink">{strings.processHeading}</h2>
            <p className="mt-4 text-[14px] leading-7 text-body">{strings.processIntro}</p>
          </div>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {strings.steps.map((step, index) => (
              <li key={step} className="flex gap-4 rounded-card border border-hairline bg-shell p-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink font-serif text-sm text-gold-light" aria-hidden>{index + 1}</span>
                <p className="pt-1 text-[14px] font-medium leading-7 text-ink">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(16rem,.7fr)_minmax(0,1.3fr)] lg:items-start" aria-labelledby="business-form-heading">
        <div className="lg:sticky lg:top-24">
          <p className="eyebrow">{brand}</p>
          <h2 id="business-form-heading" className="mt-3 font-serif text-3xl text-ink">{strings.formHeading}</h2>
          <p className="mt-4 text-[14px] leading-7 text-body">{strings.formIntro}</p>
        </div>
        <div className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-8">
          <BusinessInquiryForm locale={locale} strings={strings} />
        </div>
      </section>
    </main>
    <PublicFooter brand={brand} strings={chrome} locale={locale} />
  </>;
}
