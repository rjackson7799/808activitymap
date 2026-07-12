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

/** Map a provenance field to its staleness-threshold key (config: staleness_thresholds_days). */
function thresholdKey(field: string): string {
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

/** Stable display order for the freshness facts. */
const FIELD_ORDER = ["name", "price_band", "address", "hours", "menu"];

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeFreshness(
  rows: ProvenanceRow[],
  thresholds: StalenessThresholds,
  now: Date,
  locale: Locale,
): FreshnessDTO {
  const nowMs = now.getTime();
  const facts = rows
    .map((row) => {
      const thresholdDays = thresholds[thresholdKey(row.field)];
      const verifiedMs = new Date(row.verifiedAt).getTime();
      const ageDays = (nowMs - verifiedMs) / DAY_MS;
      const pastThreshold = thresholdDays != null && ageDays > thresholdDays;
      const expired = row.expiresAt != null && nowMs > new Date(row.expiresAt).getTime();
      return {
        field: row.field,
        label: provenanceFactLabel(row.field, locale),
        verifiedDate: isoDate(row.verifiedAt),
        isStale: pastThreshold || expired,
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
