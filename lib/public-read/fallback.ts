import type { Locale } from "@/lib/locales";
import { priceTypeLabel, seoDescriptionTemplate, seoTitleTemplate } from "./i18n";

/**
 * Fallback engine (CP4) — the field-level fallback matrix (slice-1 §publication
 * contract, ADR-008) as pure functions. The load-bearing property is what these
 * functions DON'T accept: name and menu resolvers take only the requested locale's
 * value, so there is structurally nothing to fall back to. The ONE permitted identity
 * fallback (photo alt → QA'd EN) is the only resolver that accepts an EN argument, and
 * it flags the fallback in the data.
 *
 *  Name / primary-category label  → no fallback (missing ⇒ page was never eligible)
 *  Editorial note                 → omit if absent (never EN prose on a non-EN page)
 *  Photo alt text                 → QA'd EN allowed, flagged
 *  SEO title/description          → templated from QA'd locale strings, never EN prose
 *  Menu item names + prices       → requested-locale only; prices are language-neutral
 *                                    amounts with localized chrome, never a cross-locale value
 */

function nonEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Identity field — no implicit fallback. Takes ONLY the in-locale name; there is no
 * parameter through which an EN value could arrive. A missing name means the page was
 * never eligible (the view requires it), so this throws — it must never silently blank.
 */
export function resolveName(localeName: string | null): string {
  const name = nonEmpty(localeName);
  if (!name) {
    throw new Error("listing name is required in-locale and never falls back to EN");
  }
  return name;
}

/** Editorial note — optional; omitted entirely when absent in-locale. */
export function resolveEditorialNote(localeNote: string | null): string | null {
  return nonEmpty(localeNote);
}

export interface ResolvedAlt {
  text: string | null;
  altIsEnFallback: boolean;
}

/**
 * Photo alt text — the ONLY permitted identity fallback (accessibility beats omission).
 * The QA'd EN alt may render on a non-EN page, flagged. On an EN page the two inputs are
 * the same string, so the fallback flag is false.
 */
export function resolveAltText(localeAlt: string | null, enAlt: string | null): ResolvedAlt {
  const inLocale = nonEmpty(localeAlt);
  if (inLocale) return { text: inLocale, altIsEnFallback: false };
  const en = nonEmpty(enAlt);
  if (en) return { text: en, altIsEnFallback: true };
  return { text: null, altIsEnFallback: false };
}

export interface SeoInput {
  localeTitle: string | null;
  localeDescription: string | null;
  name: string;
  categoryLabel: string;
  marketId: string;
  locale: Locale;
}

/**
 * SEO — no EN fallback. When a locale's SEO string is absent, compose it from that
 * locale's already-QA'd strings (name + category label + market). Never MT, never EN.
 */
export function resolveSeo(input: SeoInput): { title: string; description: string } {
  return {
    title:
      nonEmpty(input.localeTitle) ??
      seoTitleTemplate(input.name, input.categoryLabel, input.marketId, input.locale),
    description:
      nonEmpty(input.localeDescription) ??
      seoDescriptionTemplate(input.name, input.categoryLabel, input.marketId, input.locale),
  };
}

export interface PriceInput {
  priceCents: number | null;
  currency: string;
  priceType: "fixed" | "market" | "from";
}

function formatAmount(cents: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

/**
 * Menu item price — a language-neutral amount with localized chrome. The amount comes
 * from `menu_items` (shared across locales), so it is never a cross-locale "fallback";
 * only the surrounding label ("Market price" / "時価") is translated.
 */
export function formatMenuItemPrice(item: PriceInput, locale: Locale): string | null {
  if (item.priceType === "market") return priceTypeLabel("market", locale);
  if (item.priceCents == null) return null;
  const amount = formatAmount(item.priceCents, item.currency);
  if (item.priceType === "from") {
    if (locale === "ja") return `${amount}〜`;
    return `${priceTypeLabel("from", locale)} ${amount}`;
  }
  return amount;
}
