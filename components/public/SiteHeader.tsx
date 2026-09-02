import type { Locale } from "@/lib/locales";
import type { LocaleAlternate } from "@/lib/public-read/queries";
import { homePath } from "@/lib/public-read/paths";
import { todayPath } from "@/lib/public-read/paths";
import { todayUi } from "@/lib/i18n/today";
import { LanguageSwitcher } from "./LanguageSwitcher";

/**
 * Public site header. Brand wordmark is env-driven (BRAND_NAME, D27) — never hardcoded —
 * set in Marcellus. Sticky, hairline-bordered warm surface.
 */
export function SiteHeader({
  locale,
  brand,
  alternates,
  notAvailableLabel,
  languageLabel,
}: {
  locale: Locale;
  brand: string;
  alternates: LocaleAlternate[];
  notAvailableLabel: string;
  languageLabel: string;
}) {
  return (
    <header className="sticky top-0 z-10 h-[4.25rem] border-b border-hairline bg-white">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a
          href={homePath(locale)}
          className="rounded-sm font-serif text-lg tracking-tight text-ink sm:text-xl"
        >
          {brand}
        </a>
        <div className="flex items-center gap-2 sm:gap-4">
          <a href={todayPath(locale)} className="inline-flex min-h-10 items-center rounded-cta px-2 text-xs font-bold text-teal-dark transition hover:bg-info-bg sm:px-3 sm:text-sm">{todayUi(locale).link}</a>
          <LanguageSwitcher
            current={locale}
            alternates={alternates}
            notAvailableLabel={notAvailableLabel}
            languageLabel={languageLabel}
          />
        </div>
      </div>
    </header>
  );
}
