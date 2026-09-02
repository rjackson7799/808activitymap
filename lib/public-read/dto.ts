import type { Locale } from "@/lib/locales";

/**
 * Public DTO allowlist (CP4). These types ARE the public authorization boundary:
 * because the public surface reads through the service-role client (RLS bypassed,
 * ADR-004), nothing outside these shapes may ever reach a page. Every field here is
 * safe to publish. The BLOCKING leakage suite asserts rendered DTOs carry only these
 * keys and none of the forbidden data (draft/machine_draft text, KO rows, menu-source
 * or evidence paths, internal provenance columns, org legal names).
 *
 * Rules baked into the shapes:
 *  - money terms (prices) are language-neutral amounts formatted with locale chrome —
 *    never fetched from another locale, so they cannot "fall back" (PRD §11);
 *  - `altIsEnFallback` flags the single permitted identity fallback (ADR-008);
 *  - provenance exposes ONLY { label, verifiedDate, isStale } — never source_type,
 *    verified_by, supplied_by, confidence, or raw expires_at.
 */

export interface CategoryRef {
  slug: string;
  label: string;
}

export interface AddressDTO {
  street: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface PhotoDTO {
  /** Public URL in the publicly-readable `public-photos` bucket (never menu-sources/evidence). */
  url: string;
  alt: string | null;
  /** True when alt text is the QA'd EN fallback rendered on a non-EN page (ADR-008). */
  altIsEnFallback: boolean;
}

export interface MenuItemDTO {
  name: string;
  description: string | null;
  /** Formatted price string (locale chrome over a language-neutral amount) or null. */
  price: string | null;
  ownerPick: boolean;
}

export interface MenuSectionDTO {
  name: string;
  items: MenuItemDTO[];
}

export interface MenuDTO {
  sections: MenuSectionDTO[];
}

export interface DealDTO {
  id: string;
  title: string;
  terms: string;
  expiresAt: string;
  sponsored: boolean;
}

export interface FreshnessFact {
  /** Display label mapped from the provenance `field` (never the raw internal columns). */
  label: string;
  /** ISO date the fact was last verified. */
  verifiedDate: string;
  isStale: boolean;
}

export interface FreshnessDTO {
  facts: FreshnessFact[];
  anyStale: boolean;
  /** D15 badge contract: verified only when every configured required fact is current. */
  badgeStatus: "verified" | "stale" | "incomplete";
}

export interface HoursSpan {
  open: string;
  close: string;
}

export type HoursDay =
  | { closed: true }
  | { is24h: true }
  | { spans: HoursSpan[] };

export interface HoursDTO {
  /** Keyed mon..sun; empty when hours are unknown pre-launch. */
  weekly: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", HoursDay>>;
  exceptions: { date: string; closed: boolean; spans: HoursSpan[] | null; reason: string | null }[];
  unknown: boolean;
  sellsOutEarly: boolean;
  appointmentOnly: boolean;
  lastOrderOffsetMin: number | null;
  timezone: string;
}

export interface ListingDTO {
  id: string;
  locale: Locale;
  name: string;
  slug: string;
  seo: { title: string; description: string };
  editorialNote: string | null;
  priceBand: string | null;
  primaryCategory: CategoryRef;
  secondaryCategories: CategoryRef[];
  address: AddressDTO;
  phone: string | null;
  geo: { lat: number; lng: number } | null;
  operationalStatus: string;
  hours: HoursDTO;
  photos: PhotoDTO[];
  /** null ⇒ "menu coming soon" (page publishes without a menu). */
  menu: MenuDTO | null;
  /** Active, QA-approved localized offers only; reveal codes never enter this DTO. */
  deals: DealDTO[];
  provenance: FreshnessDTO;
}

export interface ListingCardDTO {
  slug: string;
  name: string;
  priceBand: string | null;
  primaryCategoryLabel: string;
  photo: { url: string; alt: string | null } | null;
  neighborhood: string | null;
}

export interface CategoryDTO {
  id: string;
  slug: string;
  label: string;
  listings: ListingCardDTO[];
}

export interface HomeCategoryDTO {
  slug: string;
  label: string;
  count: number;
}

export interface HomeDTO {
  categories: HomeCategoryDTO[];
}

export interface SitemapRow {
  /** Public path (no /en prefix; native-script slugs decoded). */
  path: string;
  locale: Locale;
}

/** Result of resolving a slug: a canonical hit, a single-hop alias redirect, or a miss. */
export type SlugResolution =
  | { kind: "canonical"; listingId: string }
  | { kind: "redirect"; to: string }
  | { kind: "not_found" };
