import type { Action, Role } from "./matrix";
import type { TableName } from "./config";

/**
 * THE SLICE-AVAILABILITY MASK — which roles and tables are live NOW.
 * Deployed policies = matrix.ts (contract) ∧ this file. Edited each slice;
 * matrix.ts is not. Post-ship edits require an OUTPUT_MIGRATION bump
 * (db/rls/config.ts) — shipped generated migrations are immutable.
 */

export const LIVE_ROLES: readonly Role[] = [
  "super_admin",
  "publisher",
  "editor",
  // language_reviewer_ko stays live at the DB layer: migration 15/16 already
  // grant its transition edges and seeds carry KO rows in non-published
  // states. Slice 2's deferred item is the KO reviewer QUEUE/QA/publication
  // workflow + throughput measurement, not the role's existence. KO never
  // reaches the public surface pre-KO: CP4 fences pages/sitemaps.
  "language_reviewer_ja",
  "language_reviewer_ko",
  "ops_agent",
  // vendor_owner / vendor_manager: Slice 3 (organization_memberships).
  // contributor: Slice 3 (observed_statuses; photo upload needs the upload
  // API + a storage-policy change — see DEFERRED_CAPABILITIES coupling).
];

/**
 * Live tables. The events family is deliberately ABSENT: it stays fully
 * revoked from anon AND authenticated (migration 14) — server-side ingestion
 * only. Grant normalization never touches a non-live table.
 */
export const LIVE_TABLES: readonly TableName[] = [
  "app_config",
  "audit_log",
  "categories",
  "category_locales",
  "change_requests",
  "deal_locales",
  "deals",
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
  "qa_assignments",
  "qa_work_sessions",
  "slug_aliases",
  "user_roles",
];

/** Live role + live table, but the capability is still off this slice. */
export const DEFERRED_CAPABILITIES: ReadonlyArray<{
  action: Action;
  role: Role;
  reason: string;
}> = [
  // (none in Slice 1 — contributor photo upload is masked by LIVE_ROLES;
  // when contributor goes live, its "✔/✖" photo cell must land together
  // with a storage-policy change: migration 10's insert policies are
  // staff-only.)
];
