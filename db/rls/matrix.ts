/**
 * THE CANONICAL PRD §4 CONTRACT — transcribed VERBATIM from
 * 808_portal_PRD_v2_FINAL.md §4 (lines 83–106). This file changes ONLY when
 * the PRD changes. It never names a database table: the physical meaning of
 * each cell lives in semantics.ts; which roles/tables are live this slice
 * lives in availability.ts. Deployed policies = this contract ∧ availability.
 *
 * Transcription notes (interpretations are documented, not silently applied):
 *  - The PRD table has 8 columns for 9 roles: one `lang_reviewer` column
 *    covers language_reviewer_ja and language_reviewer_ko, scoped by
 *    "✔ (own locale)". COLUMN_FOR_ROLE maps roles → columns.
 *  - There is NO anon column. Anonymous access is not a matrix cell: anon is
 *    deny-all everywhere (ADR-004 — server-side public read model).
 *  - "—" is read as NOT APPLICABLE, not deny (ADR-001): on "Vendor approval
 *    of menu", publisher/super_admin are "—" yet hold the strictly stronger
 *    publish right — they remain permitted to record external approval.
 *  - The "(D1)" tag sits on the editor cell; ops_agent's cell is the bare
 *    "record external". Same capability, both record off-platform written
 *    approval — approval_type='portal' is the vendor's own act (Slice 3).
 *  - §4 footer: super_admin/publisher/editor require MFA (semantics.ts
 *    MFA_ROLES); all mutations audit-logged; authorization server-side.
 */

export const ROLES = [
  "super_admin",
  "publisher",
  "editor",
  "language_reviewer_ja",
  "language_reviewer_ko",
  "ops_agent",
  "vendor_owner",
  "vendor_manager",
  "contributor",
] as const;
export type Role = (typeof ROLES)[number];

export const COLUMNS = [
  "super_admin",
  "publisher",
  "editor",
  "lang_reviewer",
  "ops_agent",
  "vendor_owner",
  "vendor_manager",
  "contributor",
] as const;
export type Column = (typeof COLUMNS)[number];

export const COLUMN_FOR_ROLE: Record<Role, Column> = {
  super_admin: "super_admin",
  publisher: "publisher",
  editor: "editor",
  language_reviewer_ja: "lang_reviewer",
  language_reviewer_ko: "lang_reviewer",
  ops_agent: "ops_agent",
  vendor_owner: "vendor_owner",
  vendor_manager: "vendor_manager",
  contributor: "contributor",
};

/** Exact PRD §4 cell vocabulary. Adding a string here is a PRD change. */
export type Cell =
  | "✔"
  | "✖"
  | "—"
  | "propose (CR)"
  | "propose (obs)"
  | "propose"
  | "observe"
  | "confirm-only direct (D10) + propose"
  | "✔ (on behalf)"
  | "✔ (own locale)"
  | "record external (D1)"
  | "record external"
  | "✔ if granted"
  | "✔/✔"
  | "✔/✖"
  | "✔/✔/✔"
  | "draft"
  | "request"
  | "triage"
  | "if granted"
  | "view"
  | "invite managers (D8)"
  | "own scope"
  | "own org"
  | "own items";

export const ACTIONS = [
  "Edit business facts",
  "Edit hours",
  "Menu upload/extract",
  "Translation edit/QA approve",
  "Vendor approval of menu",
  "Publish/unpublish",
  "Photos: upload / moderate",
  "Deals: create / approve / kill",
  "Claims: review/resolve disputes",
  "Billing admin (vendor side)",
  "Billing exceptions (platform)",
  "Taxonomy CRUD/merge",
  "User/role management",
  "Audit log read",
] as const;
export type Action = (typeof ACTIONS)[number];

export const MATRIX: Record<Action, Record<Column, Cell>> = {
  "Edit business facts": {
    super_admin: "✔",
    publisher: "✔",
    editor: "✔",
    lang_reviewer: "✖",
    ops_agent: "propose (CR)",
    vendor_owner: "propose (CR)",
    vendor_manager: "propose (CR)",
    contributor: "propose (obs)",
  },
  "Edit hours": {
    super_admin: "✔",
    publisher: "✔",
    editor: "✔",
    lang_reviewer: "✖",
    ops_agent: "propose",
    vendor_owner: "confirm-only direct (D10) + propose",
    vendor_manager: "propose",
    contributor: "observe",
  },
  "Menu upload/extract": {
    super_admin: "✔",
    publisher: "✔",
    editor: "✔",
    lang_reviewer: "✖",
    ops_agent: "✔ (on behalf)",
    vendor_owner: "✔",
    vendor_manager: "✔",
    contributor: "✖",
  },
  "Translation edit/QA approve": {
    super_admin: "✔",
    publisher: "✔",
    editor: "✖",
    lang_reviewer: "✔ (own locale)",
    ops_agent: "✖",
    vendor_owner: "✖",
    vendor_manager: "✖",
    contributor: "✖",
  },
  "Vendor approval of menu": {
    super_admin: "—",
    publisher: "—",
    editor: "record external (D1)",
    lang_reviewer: "✖",
    ops_agent: "record external",
    vendor_owner: "✔",
    vendor_manager: "✔ if granted",
    contributor: "✖",
  },
  "Publish/unpublish": {
    super_admin: "✔",
    publisher: "✔",
    editor: "✖",
    lang_reviewer: "✖",
    ops_agent: "✖",
    vendor_owner: "✖",
    vendor_manager: "✖",
    contributor: "✖",
  },
  "Photos: upload / moderate": {
    super_admin: "✔/✔",
    publisher: "✔/✔",
    editor: "✔/✔",
    lang_reviewer: "✖",
    ops_agent: "✔/✖",
    vendor_owner: "✔/✖",
    vendor_manager: "✔/✖",
    contributor: "✔/✖",
  },
  "Deals: create / approve / kill": {
    super_admin: "✔",
    publisher: "✔",
    editor: "✔/✔/✔",
    lang_reviewer: "✖",
    ops_agent: "draft",
    vendor_owner: "request",
    vendor_manager: "request",
    contributor: "✖",
  },
  "Claims: review/resolve disputes": {
    super_admin: "✔",
    publisher: "✔",
    editor: "✔",
    lang_reviewer: "✖",
    ops_agent: "triage",
    vendor_owner: "—",
    vendor_manager: "—",
    contributor: "—",
  },
  "Billing admin (vendor side)": {
    super_admin: "—",
    publisher: "—",
    editor: "—",
    lang_reviewer: "—",
    ops_agent: "—",
    vendor_owner: "✔",
    vendor_manager: "if granted",
    contributor: "—",
  },
  "Billing exceptions (platform)": {
    super_admin: "✔",
    publisher: "✔",
    editor: "✖",
    lang_reviewer: "✖",
    ops_agent: "view",
    vendor_owner: "—",
    vendor_manager: "—",
    contributor: "—",
  },
  "Taxonomy CRUD/merge": {
    super_admin: "✔",
    publisher: "✔",
    editor: "✖",
    lang_reviewer: "✖",
    ops_agent: "✖",
    vendor_owner: "request",
    vendor_manager: "✖",
    contributor: "✖",
  },
  "User/role management": {
    super_admin: "✔",
    publisher: "✖",
    editor: "✖",
    lang_reviewer: "✖",
    ops_agent: "✖",
    vendor_owner: "invite managers (D8)",
    vendor_manager: "✖",
    contributor: "✖",
  },
  "Audit log read": {
    super_admin: "✔",
    publisher: "✔",
    editor: "own scope",
    lang_reviewer: "own scope",
    ops_agent: "own scope",
    vendor_owner: "own org",
    vendor_manager: "own org",
    contributor: "own items",
  },
};
