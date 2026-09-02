import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { env } from "@/config/env";
import { isLocale } from "@/lib/locales";
import { ui } from "@/lib/i18n/ui";
import { trustUi } from "@/lib/i18n/trust";
import {
  getListingDTO,
  getListingLocaleAlternates,
  listAliasListingParams,
  listEligibleListingParams,
  resolveListingSlug,
} from "@/lib/public-read/server";
import { categoryPath, decodeSlug, homePath, listingPath, reportChangePath, toOrigin } from "@/lib/public-read/paths";
import { localeAlternatesMeta } from "@/lib/public-read/metadata";
import { breadcrumbJsonLd, restaurantJsonLd, serializeJsonLd } from "@/lib/schema";
import { SiteHeader } from "@/components/public/SiteHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { Breadcrumbs } from "@/components/public/Breadcrumbs";
import { PhotoGallery } from "@/components/public/PhotoGallery";
import { TrustBadges } from "@/components/public/TrustBadges";
import { OpenNowBadge } from "@/components/public/OpenNowBadge";
import { EditorialNote } from "@/components/public/EditorialNote";
import { MenuDisplay } from "@/components/public/MenuDisplay";
import { HoursTable } from "@/components/public/HoursTable";
import { HowWeKeepCurrent } from "@/components/public/HowWeKeepCurrent";
import { ShareButton } from "@/components/public/ShareButton";
import { DealCard } from "@/components/public/DealCard";
import { AffiliateModule } from "@/components/public/AffiliateModule";
import { MapPin, Phone } from "lucide-react";

/**
 * Listing detail (CP4). Slug resolution: a romanized alias single-hops to the native
 * canonical (permanentRedirect = 308, encodeURI'd). Canonical-but-not-eligible /
 * unknown → 404. All content renders server-side (JS-free); the only client bit is the
 * live open-now pill. JSON-LD is emitted from the same DTO (goldens in /lib/schema).
 */
export const dynamicParams = true;
export const revalidate = 3600;

export async function generateStaticParams() {
  const [canonical, aliases] = await Promise.all([
    listEligibleListingParams(),
    listAliasListingParams(),
  ]);
  return [...canonical, ...aliases];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; listingSlug: string }>;
}): Promise<Metadata> {
  const { locale, listingSlug } = await params;
  if (!isLocale(locale)) return {};
  const resolved = await resolveListingSlug(locale, decodeSlug(listingSlug));
  if (resolved.kind !== "canonical") return { title: ui(locale).notFoundTitle };
  const dto = await getListingDTO(locale, resolved.listingId);
  if (!dto) return { title: ui(locale).notFoundTitle };
  const origin = toOrigin(env().PORTAL_DOMAIN);
  const alternates = await getListingLocaleAlternates(resolved.listingId);
  return {
    title: dto.seo.title,
    description: dto.seo.description,
    alternates: localeAlternatesMeta(origin, listingPath(locale, dto.slug), alternates),
    ...(env().APP_ENV === "staging" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ locale: string; listingSlug: string }>;
}) {
  const { locale, listingSlug } = await params;
  if (!isLocale(locale)) notFound();

  const resolved = await resolveListingSlug(locale, decodeSlug(listingSlug));
  if (resolved.kind === "redirect") permanentRedirect(encodeURI(resolved.to));
  if (resolved.kind !== "canonical") notFound();

  const [dto, alternates] = await Promise.all([
    getListingDTO(locale, resolved.listingId),
    getListingLocaleAlternates(resolved.listingId),
  ]);
  if (!dto) notFound();

  const strings = ui(locale);
  const brand = env().BRAND_NAME;
  const origin = toOrigin(env().PORTAL_DOMAIN);

  const crumbs = [
    { name: strings.home, path: homePath(locale) },
    { name: dto.primaryCategory.label, path: categoryPath(locale, dto.primaryCategory.slug) },
    { name: dto.name, path: listingPath(locale, dto.slug) },
  ];
  const restaurantLd = restaurantJsonLd(dto, { origin });
  const breadcrumbLd = breadcrumbJsonLd(crumbs, { origin });
  const latestVerified = dto.provenance.facts.map((f) => f.verifiedDate).sort().at(-1) ?? "";
  const meta = [dto.primaryCategory.label, dto.priceBand ?? "", dto.address.city ?? ""].filter(Boolean).join(" · ");
  const addressLine = [dto.address.street, dto.address.city, dto.address.region, dto.address.postalCode]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <SiteHeader
        locale={locale}
        brand={brand}
        alternates={alternates}
        notAvailableLabel={strings.otherLocaleNotAvailable}
        languageLabel={strings.languageLabel}
      />
      <main
        id="main-content"
        className="public-page pb-24 sm:pb-12"
        data-analytics-listing={dto.id}
      >
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Breadcrumbs items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : { name: c.name, href: c.path }))} />

          <div className="mt-5">
            <PhotoGallery photos={dto.photos} />
          </div>

          <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-serif text-3xl leading-tight text-ink sm:text-[2.5rem]">{dto.name}</h1>
                  <p className="mt-2 text-[12px] font-semibold text-secondary">{meta}</p>
                </div>
                <OpenNowBadge hours={dto.hours} locale={locale} />
              </div>

              <div className="mt-4">
                <TrustBadges provenance={dto.provenance} operationalStatus={dto.operationalStatus} strings={strings} />
              </div>

              {dto.editorialNote ? (
                <section className="mt-9">
                  <h2 className="font-serif text-[1.3125rem] text-ink">{strings.aboutTitle(dto.name)}</h2>
                  <div className="mt-4">
                    <EditorialNote note={dto.editorialNote} label={strings.localTipLabel} />
                  </div>
                </section>
              ) : null}

              <section className="mt-10">
                <h2 className="font-serif text-[1.3125rem] text-ink">{strings.menu}</h2>
                <div className="mt-4 rounded-card border border-hairline bg-surface p-5 shadow-card sm:p-6">
                  {dto.menu ? (
                    <MenuDisplay menu={dto.menu} strings={strings} />
                  ) : (
                    <p className="text-[14px] text-secondary">{strings.menuComingSoon(latestVerified)}</p>
                  )}
                </div>
              </section>

              {dto.deals.length > 0 ? (
                <section className="mt-10" aria-labelledby="current-offers-heading">
                  <h2 id="current-offers-heading" className="font-serif text-[1.3125rem] text-ink">{strings.deals}</h2>
                  <div className="mt-4 grid gap-4">
                    {dto.deals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        locale={locale}
                        expiresLabel={strings.dealExpires(formatDealDate(deal.expiresAt, locale))}
                        labels={{
                          reveal: strings.revealDeal,
                          revealing: strings.revealingDeal,
                          code: strings.dealCode,
                          unavailable: strings.dealUnavailable,
                          sponsored: strings.sponsored,
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted">{strings.dealDisclosure}</p>
                </section>
              ) : null}

              {dto.affiliateLinks.length > 0 ? (
                <AffiliateModule
                  links={dto.affiliateLinks}
                  locale={locale}
                  title={strings.affiliateTitle}
                  intro={strings.affiliateIntro}
                  cta={strings.affiliateCta}
                  disclosure={strings.affiliateDisclosure}
                />
              ) : null}

              <div className="mt-10">
                <HowWeKeepCurrent provenance={dto.provenance} strings={strings} />
                <p className="mt-4 text-[12.5px]"><a href={reportChangePath(locale, dto.id)} className="font-semibold text-teal-dark underline underline-offset-4">{trustUi(locale).reportLink}</a></p>
              </div>
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
              <div className="rounded-card border border-hairline bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <ShareButton
                    title={dto.name}
                    listingId={dto.id}
                    locale={locale}
                    label={strings.share}
                    copiedLabel={strings.linkCopied}
                  />
                  {dto.phone ? (
                    <a href={`tel:${dto.phone}`} className="inline-flex min-h-9 items-center gap-2 rounded-cta border border-hairline px-3 text-[12px] font-semibold text-ink hover:bg-neutral">
                      <Phone size={15} aria-hidden />
                      {strings.callThisPlace}
                    </a>
                  ) : null}
                </div>
              </div>

              <section className="surface-ocean rounded-card p-5 text-white shadow-lift">
                <h2 className="font-serif text-xl text-white">{strings.hours}</h2>
                <div className="mt-3">
                  <HoursTable hours={dto.hours} strings={strings} inverse />
                </div>
                <div className="my-5 h-px bg-white/20" />
                <h2 className="font-serif text-xl text-white">{strings.location}</h2>
                <p className="mt-3 text-[13.5px] leading-relaxed text-white/85">{addressLine}</p>
                {dto.geo ? (
                  <p className="mt-4">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${dto.geo.lat},${dto.geo.lng}`}
                      rel="noopener noreferrer"
                      data-analytics="directions"
                      data-provider="google"
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-cta bg-white px-4 text-[12.5px] font-bold text-teal-dark transition hover:bg-shell"
                    >
                      <MapPin size={16} aria-hidden />
                      {strings.directions}
                    </a>
                  </p>
                ) : null}
              </section>
            </aside>
          </div>
        </div>
      </main>

      {dto.geo ? (
        <aside
          aria-label={strings.directions}
          className="fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-white/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden"
        >
          <div className="mx-auto max-w-md">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${dto.geo.lat},${dto.geo.lng}`}
                  rel="noopener noreferrer"
                  data-analytics="directions"
                  data-provider="google"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-cta bg-ink px-4 text-[13px] font-bold text-white"
                >
                  <MapPin size={16} aria-hidden />
                  {strings.directions}
                </a>
          </div>
        </aside>
      ) : null}
      <PublicFooter brand={brand} strings={strings} locale={locale} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(restaurantLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }} />
      <script src="/image-fallback.js" defer />
      <script src="/public-enhancements.js" defer />
    </>
  );
}

function formatDealDate(value: string, locale: "en" | "ja" | "ko") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale, {
    month: "short", day: "numeric", year: "numeric", timeZone: "Pacific/Honolulu",
  }).format(new Date(value));
}
