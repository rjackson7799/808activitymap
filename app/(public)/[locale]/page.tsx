import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/config/env";
import { isLocale } from "@/lib/locales";
import { ui } from "@/lib/i18n/ui";
import { getHomeDTO, getServedLocales } from "@/lib/public-read/server";
import { categoryPath, homePath, toOrigin } from "@/lib/public-read/paths";
import { localeAlternatesMeta } from "@/lib/public-read/metadata";
import type { LocaleAlternate } from "@/lib/public-read/queries";
import { SiteHeader } from "@/components/public/SiteHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicEmptyState } from "@/components/public/PublicEmptyState";

export const dynamicParams = true;
export const revalidate = 3600;

async function homeAlternates(): Promise<LocaleAlternate[]> {
  const served = await getServedLocales();
  return served.map((locale) => ({ locale, href: homePath(locale), available: true }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const origin = toOrigin(env().PORTAL_DOMAIN);
  const strings = ui(locale);
  return {
    title: env().BRAND_NAME,
    description: strings.browse,
    alternates: localeAlternatesMeta(origin, homePath(locale), await homeAlternates()),
    ...(env().APP_ENV === "staging" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [home, alternates] = await Promise.all([getHomeDTO(locale), homeAlternates()]);
  const strings = ui(locale);
  const brand = env().BRAND_NAME;

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
        <section className="border-b border-hairline bg-[var(--gradient-backdrop)]">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="eyebrow">{brand}</p>
            <h1 className="mt-3 max-w-2xl font-serif text-[2.25rem] leading-[1.12] text-ink sm:text-[3.25rem]">
              {locale === "en" ? <>
                Browse Waik<span style={{ fontFamily: '"Times New Roman", serif' }}>ī</span>k<span style={{ fontFamily: '"Times New Roman", serif' }}>ī</span>
              </> : strings.browse}
            </h1>
            <p className="mt-4 max-w-2xl text-[14px] leading-[1.65] text-body sm:text-[15px]">{strings.browseIntro}</p>
          </div>
        </section>

        {home.categories.length > 0 ? (
          <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 py-8 sm:grid-cols-2 sm:px-6 sm:py-10 lg:grid-cols-3">
            {home.categories.map((category) => (
              <li key={category.slug}>
                <a
                  href={categoryPath(locale, category.slug)}
                  className="group flex min-h-28 items-center justify-between rounded-card border border-hairline bg-surface px-5 py-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span>
                    <span className="font-serif text-xl text-ink">{category.label}</span>
                    <span className="mt-2 block text-[12px] font-semibold text-secondary">{category.count}</span>
                  </span>
                  <span className="grid size-9 place-items-center rounded-full bg-field text-teal-dark transition group-hover:bg-info-bg" aria-hidden>→</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
            <PublicEmptyState title={strings.browseEmptyTitle} body={strings.browseEmptyBody} />
          </div>
        )}
      </main>
      <PublicFooter brand={brand} strings={strings} locale={locale} />
    </>
  );
}
