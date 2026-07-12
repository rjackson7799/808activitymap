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

export const dynamicParams = false;

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
      <SiteHeader locale={locale} brand={brand} alternates={alternates} notAvailableLabel={strings.otherLocaleNotAvailable} />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <section className="rounded-card border border-hairline bg-surface p-8 shadow-card sm:p-12">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-label">{brand}</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-ink sm:text-5xl">{strings.browse}</h1>
        </section>

        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {home.categories.map((category) => (
            <li key={category.slug}>
              <a
                href={categoryPath(locale, category.slug)}
                className="flex items-center justify-between rounded-card border border-hairline bg-surface px-5 py-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="font-serif text-xl text-ink">{category.label}</span>
                <span className="rounded-chip bg-neutral px-2.5 py-1 text-[12px] font-semibold text-secondary">
                  {category.count}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </main>
      <PublicFooter brand={brand} strings={strings} />
    </>
  );
}
