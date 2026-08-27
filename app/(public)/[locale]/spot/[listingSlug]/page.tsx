import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { env } from "@/config/env";
import { isLocale } from "@/lib/locales";
import { ui } from "@/lib/i18n/ui";
import {
  getListingDTO,
  getListingLocaleAlternates,
  listAliasListingParams,
  listEligibleListingParams,
  resolveListingSlug,
} from "@/lib/public-read/server";
import { categoryPath, decodeSlug, homePath, listingPath, toOrigin } from "@/lib/public-read/paths";
import { localeAlternatesMeta } from "@/lib/public-read/metadata";
import { breadcrumbJsonLd, restaurantJsonLd } from "@/lib/schema";
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

function jsonLd(node: Record<string, unknown>): string {
  // Escape `<` so a stray "</script>" in data can't break out of the tag.
  return JSON.stringify(node).replace(/</g, "\\u003c");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; listingSlug: string }>;
}): Promise<Metadata> {
  const { locale, listingSlug } = await params;
  if (!isLocale(locale)) return {};
  const resolved = await resolveListingSlug(locale, decodeSlug(listingSlug));
  if (resolved.kind !== "canonical") return {};
  const dto = await getListingDTO(locale, resolved.listingId);
  if (!dto) return {};
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
      <SiteHeader locale={locale} brand={brand} alternates={alternates} notAvailableLabel={strings.otherLocaleNotAvailable} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Breadcrumbs items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : { name: c.name, href: c.path }))} />

        <div className="mt-5">
          <PhotoGallery photos={dto.photos} />
        </div>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-4xl leading-tight text-ink">{dto.name}</h1>
            <p className="mt-2 text-[14px] text-secondary">{meta}</p>
          </div>
          <OpenNowBadge hours={dto.hours} locale={locale} />
        </div>

        <div className="mt-4">
          <TrustBadges provenance={dto.provenance} operationalStatus={dto.operationalStatus} strings={strings} />
        </div>

        {dto.editorialNote ? (
          <section className="mt-8">
            <h2 className="font-serif text-xl text-ink">{strings.aboutHeading}</h2>
            <div className="mt-3">
              <EditorialNote note={dto.editorialNote} />
            </div>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="font-serif text-2xl text-ink">{strings.menu}</h2>
          <div className="mt-4">
            {dto.menu ? (
              <MenuDisplay menu={dto.menu} strings={strings} />
            ) : (
              <p className="text-[14px] text-secondary">{strings.menuComingSoon(latestVerified)}</p>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl text-ink">{strings.hours}</h2>
          <div className="mt-4 rounded-card border border-hairline bg-surface p-5 shadow-card">
            <HoursTable hours={dto.hours} strings={strings} />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl text-ink">{strings.location}</h2>
          <div className="mt-4 rounded-card border border-hairline bg-surface p-5 text-[14px] text-body shadow-card">
            <p>{addressLine}</p>
            {dto.phone ? (
              <p className="mt-2">
                <a href={`tel:${dto.phone}`} className="text-teal-dark underline-offset-2 hover:underline">
                  {dto.phone}
                </a>
              </p>
            ) : null}
            {dto.geo ? (
              <p className="mt-3">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${dto.geo.lat},${dto.geo.lng}`}
                  rel="noopener noreferrer"
                  className="font-semibold text-teal-dark underline-offset-2 hover:underline"
                >
                  {strings.directions}
                </a>
              </p>
            ) : null}
          </div>
        </section>

        <div className="mt-10">
          <HowWeKeepCurrent provenance={dto.provenance} strings={strings} />
        </div>
      </main>
      <PublicFooter brand={brand} strings={strings} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(restaurantLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd) }} />
    </>
  );
}
