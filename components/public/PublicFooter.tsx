import type { UiStrings } from "@/lib/i18n/ui";
import type { Locale } from "@/lib/locales";
import { businessUi } from "@/lib/i18n/business";
import { trustUi } from "@/lib/i18n/trust";
import { forBusinessPath, reportChangePath, trustPath } from "@/lib/public-read/paths";

/**
 * Public footer. Brand is env-driven (D27). The AI-visibility line is sold as a CAPABILITY
 * ("AI-ready — findable & citable"), never a ranking promise (PRD §9 guardrail).
 */
export function PublicFooter({ brand, strings, locale }: { brand: string; strings: UiStrings; locale: Locale }) {
  const trust = trustUi(locale);
  const business = businessUi(locale);
  return (
    <footer className="border-t border-hairline bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 py-8 text-[12.5px] text-secondary sm:px-6">
        <p className="font-serif text-base text-ink">{brand}</p>
        <p>{strings.aiReady}</p>
        <nav aria-label={trust.trustLink} className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          <a href={trustPath(locale)} className="font-semibold text-teal-dark underline-offset-4 hover:underline">{trust.trustLink}</a>
          <a href={reportChangePath(locale)} className="font-semibold text-teal-dark underline-offset-4 hover:underline">{trust.reportLink}</a>
          {locale !== "ko" ? <a href={forBusinessPath(locale)} className="font-semibold text-teal-dark underline-offset-4 hover:underline">{business.link}</a> : null}
        </nav>
      </div>
    </footer>
  );
}
