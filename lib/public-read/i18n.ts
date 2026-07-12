import type { Locale } from "@/lib/locales";

/**
 * Data-layer locale strings (CP4). These produce DTO *values* — SEO templates,
 * market names, price-type labels, provenance fact labels — so they live with the
 * read model. Purely presentational chrome (buttons, section headings) lives in the
 * components. All strings here are first-party app copy, never user content, so they
 * are the same "translated chrome" the fallback matrix treats as always-available.
 *
 * KO strings are present so the config flip in Slice 2 needs no code change here;
 * they are never served until locale_availability lists `ko`.
 */

const DEFAULT_MARKET_LABEL: Record<Locale, string> = { en: "Waikīkī", ja: "ワイキキ", ko: "와이키키" };

export const MARKET_LABELS: Record<string, Record<Locale, string>> = {
  "oahu-waikiki": DEFAULT_MARKET_LABEL,
};

export function marketLabel(marketId: string, locale: Locale): string {
  return (MARKET_LABELS[marketId] ?? DEFAULT_MARKET_LABEL)[locale];
}

/** Localized label for non-fixed prices — a language-neutral concept, localized chrome. */
export function priceTypeLabel(priceType: "market" | "from", locale: Locale): string {
  const labels: Record<Locale, { market: string; from: string }> = {
    en: { market: "Market price", from: "From" },
    ja: { market: "時価", from: "〜" },
    ko: { market: "시가", from: "부터" },
  };
  return labels[locale][priceType];
}

/** Provenance `field` → friendly, non-sensitive display label for "How we keep this current". */
export function provenanceFactLabel(field: string, locale: Locale): string {
  const businessDetails: Record<Locale, string> = { en: "Business details", ja: "店舗情報", ko: "업체 정보" };
  const labels: Record<string, Record<Locale, string>> = {
    name: businessDetails,
    price_band: { en: "Pricing", ja: "価格帯", ko: "가격대" },
    address: { en: "Location", ja: "所在地", ko: "위치" },
    hours: { en: "Hours", ja: "営業時間", ko: "영업시간" },
    menu: { en: "Menu prices", ja: "メニュー価格", ko: "메뉴 가격" },
  };
  return (labels[field] ?? businessDetails)[locale];
}

/**
 * SEO title/description templates (fallback matrix: absent SEO is composed from
 * already-QA'd locale strings — name + category label + market — never MT, never EN
 * prose on a non-EN page).
 */
export function seoTitleTemplate(
  name: string,
  categoryLabel: string,
  marketId: string,
  locale: Locale,
): string {
  const market = marketLabel(marketId, locale);
  switch (locale) {
    case "ja":
      return `${name}｜${market}の${categoryLabel}`;
    case "ko":
      return `${name} | ${market} ${categoryLabel}`;
    default:
      return `${name} — ${categoryLabel} in ${market}`;
  }
}

export function seoDescriptionTemplate(
  name: string,
  categoryLabel: string,
  marketId: string,
  locale: Locale,
): string {
  const market = marketLabel(marketId, locale);
  switch (locale) {
    case "ja":
      return `${market}の${categoryLabel}、${name}。地元チームが確認した営業情報。`;
    case "ko":
      return `${market}의 ${categoryLabel}, ${name}. 현지 팀이 확인한 정보.`;
    default:
      return `${name} — a locals-verified ${categoryLabel.toLowerCase()} in ${market}.`;
  }
}
