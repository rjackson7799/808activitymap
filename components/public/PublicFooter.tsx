import type { UiStrings } from "@/lib/i18n/ui";

/**
 * Public footer. Brand is env-driven (D27). The AI-visibility line is sold as a CAPABILITY
 * ("AI-ready — findable & citable"), never a ranking promise (PRD §9 guardrail).
 */
export function PublicFooter({ brand, strings }: { brand: string; strings: UiStrings }) {
  return (
    <footer className="border-t border-hairline bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 py-8 text-[12.5px] text-secondary sm:px-6">
        <p className="font-serif text-base text-ink">{brand}</p>
        <p>{strings.aiReady}</p>
      </div>
    </footer>
  );
}
