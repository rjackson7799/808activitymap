/**
 * Generator configuration: the output migration filename and the table
 * registry the semantics layer may reference.
 *
 * OUTPUT_MIGRATION protocol (ADR-003):
 *  - Pre-ship: the generator rewrites this one file in place; the drift gate
 *    (`npm run rls:generate` + staged git diff) keeps it honest.
 *  - Post-ship: NEVER edit a shipped generated migration. Bump this constant
 *    to a new timestamped filename — the generated file is self-contained
 *    (drops all generated policies, recreates full state), so the old file
 *    stays immutable and replay order remains forward-only.
 *  - The generator asserts this filename sorts LAST in supabase/migrations/:
 *    every future schema migration therefore requires a bump + regenerate.
 */

export const OUTPUT_MIGRATION = "20260829120000_rls_policies.sql";

/** Tables that exist as of CP1/CP2 (migrations 1–17) + CP5 (rate_limits). */
export const CURRENT_TABLES = [
  "app_config",
  "audit_log",
  "categories",
  "category_locales",
  "change_requests",
  "events",
  "hours_exceptions",
  "hours_sets",
  "listing_categories",
  "listing_locales",
  "listing_media",
  "listings",
  "locations",
  "markets",
  "media",
  "media_locales",
  "menu_documents",
  "menu_item_locales",
  "menu_items",
  "menu_section_locales",
  "menu_sections",
  "menu_version_locales",
  "menu_versions",
  "organizations",
  "provenance",
  "rate_limits",
  "slug_aliases",
  "user_roles",
] as const;

/**
 * Tables the PRD §4 matrix references that arrive in later slices. The
 * contract (matrix.ts + semantics.ts) may name them now; the availability
 * mask keeps them out of the generated output until they exist.
 */
export const FUTURE_TABLES = [
  "claims", // Slice 3
  "deal_locales", // Slice 7
  "deals", // Slice 7
  "observed_statuses", // Slice 3
  "organization_memberships", // Slice 3
  "subscriptions", // Slice 5
] as const;

export const KNOWN_TABLES = [...CURRENT_TABLES, ...FUTURE_TABLES] as const;

export type TableName = (typeof KNOWN_TABLES)[number];
