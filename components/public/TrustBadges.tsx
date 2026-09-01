import { BadgeCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FreshnessDTO } from "@/lib/public-read/dto";
import type { UiStrings } from "@/lib/i18n/ui";

/**
 * Trust/provenance chips beside the listing title. Grounded in DATA we actually hold — the
 * provenance freshness summary — never fabricated. The provenance chip ALWAYS renders on a
 * published listing (green only when the complete D15 fact set is current). A
 * temporarily-closed venue gets a warning chip. No "verified redemptions"-style claims.
 */
export function TrustBadges({
  provenance,
  operationalStatus,
  strings,
}: {
  provenance: FreshnessDTO;
  operationalStatus: string;
  strings: UiStrings;
}) {
  const latest = provenance.facts.map((f) => f.verifiedDate).sort().at(-1);
  const isVerified = provenance.badgeStatus === "verified";
  const isStale = provenance.badgeStatus === "stale";
  const badgeLabel = isVerified
    ? strings.verifiedLocal
    : isStale
      ? strings.verificationDue
      : strings.verificationInProgress;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {operationalStatus === "temporarily_closed" ? (
        <Badge variant="stale">{strings.temporarilyClosed}</Badge>
      ) : null}
      <Badge variant={isVerified ? "verified" : isStale ? "stale" : "neutral"}>
        {isVerified ? <BadgeCheck size={13} strokeWidth={2.2} aria-hidden /> : <Clock size={13} strokeWidth={2.2} aria-hidden />}
        {badgeLabel}
        {latest && isVerified ? ` · ${strings.verifiedOn(latest)}` : ""}
      </Badge>
    </div>
  );
}
