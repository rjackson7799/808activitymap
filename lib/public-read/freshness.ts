import type { Locale } from "@/lib/locales";
import type { FreshnessDTO } from "./dto";
import { provenanceFactLabel } from "./i18n";

/**
 * Provenance → "How we keep this current" freshness summary (CP4, D15).
 *
 * Pure and injected-`now` so staleness is deterministically testable. The output is
 * the strict allowlist { label, verifiedDate, isStale } — the raw provenance columns
 * (source_type, verified_by, supplied_by, confidence, expires_at, ids) NEVER leave this
 * function. A published page whose provenance later expires still serves; it just shows
 * a stale chip (D15: staleness is a chip, never an auto-unpublish).
 */

export interface ProvenanceRow {
  targetTable: string;
  field: string;
  verifiedAt: string; // ISO
  expiresAt: string | null; // ISO
}

export type StalenessThresholds = Record<string, number>; // key → days
export interface BadgeFreshnessRules {
  badge_fields: string[];
  suspend_on_stale: boolean;
}

export type BadgeStatus = "verified" | "stale" | "incomplete";

/** Map stored provenance to the public badge's semantic fact names. */
export function provenanceBadgeKey(row: Pick<ProvenanceRow, "targetTable" | "field">): string {
  if (row.targetTable === "media" && row.field === "rights") return "photo";
  if (row.field === "price_band") return "price";
  return row.field;
}

/** Map a provenance field to its staleness-threshold key (config: staleness_thresholds_days). */
export function provenanceThresholdKey(field: string): string {
  switch (field) {
    case "hours":
      return "hours";
    case "price_band":
    case "price":
      return "price";
    case "menu":
    case "content":
      return "menu";
    case "editorial_note":
      return "editorial_note";
    default:
      return "business_fact"; // name, address, geo, phone, operational_status
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shared freshness rule for public trust chips and the staff dashboard. */
export function isProvenanceStale(
  row: Pick<ProvenanceRow, "field" | "verifiedAt" | "expiresAt">,
  thresholds: StalenessThresholds,
  now: Date,
): boolean {
  const thresholdDays = thresholds[provenanceThresholdKey(row.field)];
  const verifiedMs = new Date(row.verifiedAt).getTime();
  const ageDays = (now.getTime() - verifiedMs) / DAY_MS;
  const pastThreshold = thresholdDays != null && ageDays > thresholdDays;
  const expired = row.expiresAt != null && now.getTime() > new Date(row.expiresAt).getTime();
  return pastThreshold || expired;
}

/** Stable display order for the freshness facts. */
const FIELD_ORDER = ["name", "price_band", "address", "hours", "menu"];

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

export function computeFreshness(
  rows: ProvenanceRow[],
  thresholds: StalenessThresholds,
  now: Date,
  locale: Locale,
): Omit<FreshnessDTO, "badgeStatus"> {
  const facts = rows
    // The badge evaluates the complete evidence set separately. This public summary
    // stays concise and avoids repeating a generic label for geo, phone, photo rights,
    // and category evidence.
    .filter((row) => FIELD_ORDER.includes(row.field))
    .map((row) => {
      return {
        field: row.field,
        label: provenanceFactLabel(row.field, locale),
        verifiedDate: isoDate(row.verifiedAt),
        isStale: isProvenanceStale(row, thresholds, now),
      };
    })
    .sort((a, b) => {
      const ai = FIELD_ORDER.indexOf(a.field);
      const bi = FIELD_ORDER.indexOf(b.field);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .map(({ label, verifiedDate, isStale }) => ({ label, verifiedDate, isStale }));

  return { facts, anyStale: facts.some((f) => f.isStale) };
}

/**
 * A listing earns the badge only when every required semantic fact has at least one
 * current approved provenance row. Multiple photos are an any-fresh set: one current,
 * rights-cleared photo is sufficient even if an older attached photo is stale.
 */
export function computeBadgeStatus(
  rows: ProvenanceRow[],
  thresholds: StalenessThresholds,
  rules: BadgeFreshnessRules,
  now: Date,
): BadgeStatus {
  let hasStaleRequiredFact = false;

  for (const requiredField of rules.badge_fields) {
    const matching = rows.filter((row) => provenanceBadgeKey(row) === requiredField);
    if (matching.length === 0) return "incomplete";
    if (matching.some((row) => !isProvenanceStale(row, thresholds, now))) continue;
    hasStaleRequiredFact = true;
  }

  return rules.suspend_on_stale && hasStaleRequiredFact ? "stale" : "verified";
}
