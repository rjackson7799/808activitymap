import type { Locale } from "@/lib/locales";
import type { LocaleAlternate } from "@/lib/public-read/queries";

/**
 * Language switcher (CP4, D3). Plain <a> links so it works with JS disabled — a full
 * navigation re-enters the proxy and rewrites correctly. Renders from the same
 * locale-availability data as hreflang. When the target locale isn't available for this
 * page, the link points to a localized fallback (category/home) and is titled with
 * microcopy — never a dead control or a 404.
 */

const LOCALE_LABEL: Record<Locale, string> = { en: "EN", ja: "日本語", ko: "한국어" };

export function LanguageSwitcher({
  current,
  alternates,
  notAvailableLabel,
}: {
  current: Locale;
  alternates: LocaleAlternate[];
  notAvailableLabel: string;
}) {
  return (
    <nav aria-label="Language" className="flex items-center gap-1">
      {alternates.map((alt) =>
        alt.locale === current ? (
          <span
            key={alt.locale}
            aria-current="true"
            className="rounded-chip bg-ink px-3 py-1 text-[12px] font-semibold text-white"
          >
            {LOCALE_LABEL[alt.locale]}
          </span>
        ) : (
          <a
            key={alt.locale}
            href={alt.href}
            hrefLang={alt.locale}
            title={alt.available ? undefined : notAvailableLabel}
            className="rounded-chip border border-hairline px-3 py-1 text-[12px] font-medium text-ink hover:bg-neutral"
          >
            {LOCALE_LABEL[alt.locale]}
          </a>
        ),
      )}
    </nav>
  );
}
