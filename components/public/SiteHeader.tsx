import Link from "next/link";
import type { Locale } from "@/lib/locales";
import type { LocaleAlternate } from "@/lib/public-read/queries";
import { homePath } from "@/lib/public-read/paths";
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
}: {
  locale: Locale;
  brand: string;
  alternates: LocaleAlternate[];
  notAvailableLabel: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-shell/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href={homePath(locale)} className="font-serif text-xl tracking-tight text-ink">
          {brand}
        </Link>
        <LanguageSwitcher current={locale} alternates={alternates} notAvailableLabel={notAvailableLabel} />
      </div>
    </header>
  );
}
