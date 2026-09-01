import type { Locale } from "@/lib/locales";
import type { LocaleAlternate } from "@/lib/public-read/queries";
import { Check, ChevronDown, Globe2 } from "lucide-react";

/**
 * Language switcher (CP4, D3). Plain <a> links so it works with JS disabled — a full
 * navigation re-enters the proxy and rewrites correctly. Renders from the same
 * locale-availability data as hreflang. When the target locale isn't available for this
 * page, the link points to a localized fallback (category/home) and is titled with
 * microcopy — never a dead control or a 404.
 */

const LOCALE_OPTION: Record<Locale, { compact: string; native: string; english: string }> = {
  en: { compact: "EN", native: "English", english: "English" },
  ja: { compact: "日本語", native: "日本語", english: "Japanese" },
  ko: { compact: "한국어", native: "한국어", english: "Korean" },
};

export function LanguageSwitcher({
  current,
  alternates,
  notAvailableLabel,
  languageLabel,
}: {
  current: Locale;
  alternates: LocaleAlternate[];
  notAvailableLabel: string;
  languageLabel: string;
}) {
  return (
    <details className="group relative">
      <summary
        aria-label={languageLabel}
        className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-cta border border-hairline bg-surface px-3 text-[12px] font-semibold text-ink transition hover:bg-neutral [&::-webkit-details-marker]:hidden"
      >
        <Globe2 size={16} className="text-teal-dark" aria-hidden />
        <span>{LOCALE_OPTION[current].compact}</span>
        <ChevronDown size={14} className="text-secondary transition group-open:rotate-180" aria-hidden />
      </summary>
      <nav
        aria-label={languageLabel}
        className="absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-48 overflow-hidden rounded-cta border border-hairline bg-surface p-1.5 shadow-[0_18px_40px_-12px_rgba(20,40,60,.28)]"
      >
        {alternates.map((alt) => {
          const isCurrent = alt.locale === current;
          const option = LOCALE_OPTION[alt.locale];
          return (
            <a
              key={alt.locale}
              href={alt.href}
              hrefLang={alt.locale}
              aria-label={option.native}
              aria-current={isCurrent ? "page" : undefined}
              title={alt.available ? undefined : notAvailableLabel}
              data-analytics={isCurrent ? undefined : "language-switch"}
              data-from={current}
              data-to={alt.locale}
              className="flex min-h-12 items-center justify-between gap-4 rounded-field px-3 py-2 text-[12.5px] font-semibold text-ink hover:bg-field aria-[current=page]:bg-field"
            >
              <span className="min-w-0 text-left leading-tight">
                <span className="block">{option.native}</span>
                {option.english !== option.native ? (
                  <span aria-hidden="true" className="mt-1 block text-[10.5px] font-medium text-secondary">
                    {option.english}
                  </span>
                ) : null}
              </span>
              {isCurrent ? <Check size={15} className="text-teal" aria-hidden /> : null}
            </a>
          );
        })}
      </nav>
    </details>
  );
}
