import { CircleCheck, CircleAlert } from "lucide-react";
import type { FreshnessDTO } from "@/lib/public-read/dto";
import type { UiStrings } from "@/lib/i18n/ui";

/**
 * "How we keep this current" — the signature provenance block (P0-10). Maps 1:1 to the
 * provenance rows: each verified fact with its date, amber when past its staleness
 * threshold (D15 — a stale fact shows a re-check chip, it never hides the page). This is
 * the trust surface that distinguishes the product; every published fact carries provenance.
 */
export function HowWeKeepCurrent({
  provenance,
  strings,
}: {
  provenance: FreshnessDTO;
  strings: UiStrings;
}) {
  if (provenance.facts.length === 0) return null;

  return (
    <section aria-labelledby="how-current" className="rounded-card border border-hairline bg-shell p-5">
      <h2 id="how-current" className="font-serif text-xl text-ink">
        {strings.howWeKeepCurrent}
      </h2>
      <p className="mt-1 text-[13px] text-secondary">{strings.verifiedByTeam}</p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {provenance.facts.map((fact) => (
          <li key={fact.label} className="flex items-center gap-2.5 text-[13.5px]">
            {fact.isStale ? (
              <CircleAlert size={16} strokeWidth={2} className="text-warning" aria-hidden />
            ) : (
              <CircleCheck size={16} strokeWidth={2} className="text-success" aria-hidden />
            )}
            <span className="font-medium text-ink">{fact.label}</span>
            <span className="text-secondary">
              {strings.verifiedOn(fact.verifiedDate)}
              {fact.isStale ? ` · ${strings.stale}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
