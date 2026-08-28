import type { Action, Cell, Role } from "./matrix";
import type { TableName } from "./config";

/**
 * SCHEMA TRUTH: what each PRD §4 cell means physically — which tables, which
 * operations, which row predicate. This file changes when the SCHEMA evolves
 * (new tables, new columns); matrix.ts changes only when the PRD does.
 *
 * Slice-1 interpretation notes (decide-and-note, ADR-003):
 *  - "own scope" audit read = rows where actor = auth.uid(). Vendor
 *    "own org" / contributor "own items" collapse to org- and item-scoped
 *    predicates in Slice 3; until then those roles are masked entirely.
 *  - Editor is ✖ on "Translation edit/QA approve": editor cannot write ANY
 *    locale-content table (incl. EN rows) — EN authoring is publisher work
 *    until the PRD says otherwise.
 *  - Publication state is fn-owned: publish/unpublish_listing_locale,
 *    transition_listing_locale, transition_menu_version_locale (migrations
 *    15/16). fnOwned emissions produce NO policy — the deny is the point —
 *    and PROTECTED_COLUMNS keeps direct column writes impossible for every
 *    authenticated JWT regardless of role.
 *  - provenance writes are fn-owned by upsert_provenance (migration 12).
 */

export type Op = "select" | "insert" | "update" | "delete";
export const OP_ORDER: readonly Op[] = ["select", "insert", "update", "delete"];

export type Predicate =
  | { kind: "all" }
  /** Row's locale column must equal the reviewer-role's locale. */
  | { kind: "ownLocale"; column: string }
  /** Row's actor column must equal auth.uid(). */
  | { kind: "ownRows"; actorColumn: string }
  /** No policy emitted — the named SECURITY DEFINER fn(s) own this path. */
  | { kind: "fnOwned"; fn: string }
  /**
   * D10 shape: direct write limited to the named columns (column-scoped
   * grant + row policy). Encodable now, masked until Slice 3 — the model
   * fails closed if one survives masking before the generator learns to
   * emit it.
   */
  | { kind: "columnScoped"; columns: string[] };

export interface Emission {
  tables: TableName[];
  ops: Op[];
  predicate: Predicate;
  /** "mfa" → aal2 is ANDed iff the acting role is in MFA_ROLES. */
  aal: "mfa" | "none";
}

/** PRD §4 footer: privileged roles require MFA — their writes carry aal2. */
export const MFA_ROLES: readonly Role[] = ["super_admin", "publisher", "editor"];

export const REVIEWER_LOCALE: Partial<Record<Role, string>> = {
  language_reviewer_ja: "ja",
  language_reviewer_ko: "ko",
};

/**
 * Fn-owned state columns: UPDATE and INSERT grants exclude these, so a
 * direct status flip fails with `permission denied for column` for any
 * authenticated JWT. The owning SECURITY DEFINER fns (owner postgres)
 * bypass grants and RLS — FORCE ROW LEVEL SECURITY must NEVER be enabled.
 */
export const PROTECTED_COLUMNS: Partial<Record<TableName, string[]>> = {
  listings: ["publication_status"],
  listing_locales: ["status"],
  menu_version_locales: [
    "status",
    "approval_type",
    "approval_evidence_media_id",
    "approved_by",
    "approved_at",
  ],
};

const LOCALE_CONTENT_TABLES: TableName[] = [
  "category_locales",
  "listing_locales",
  "media_locales",
  "menu_item_locales",
  "menu_section_locales",
];

const BUSINESS_FACT_TABLES: TableName[] = [
  "listing_categories",
  "listings",
  "locations",
  "organizations",
  "slug_aliases",
];

const MENU_STRUCTURE_TABLES: TableName[] = [
  "menu_documents",
  "menu_items",
  "menu_sections",
  "menu_versions",
];

/**
 * Per action: the physical meaning of every cell value that appears in that
 * row. The model throws if a MATRIX row contains a cell with no entry here
 * (fail closed — a new PRD cell must be interpreted deliberately).
 * SELECT visibility is granted once, in EXTRA_SURFACES, not per action.
 */
export const SEMANTICS: Record<Action, Partial<Record<Cell, Emission[]>>> = {
  "Edit business facts": {
    "✔": [
      {
        tables: BUSINESS_FACT_TABLES,
        ops: ["insert", "update", "delete"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
    ],
    "propose (CR)": [
      {
        tables: ["change_requests"],
        ops: ["select", "insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "propose (obs)": [
      {
        tables: ["observed_statuses"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "✖": [],
  },

  "Edit hours": {
    "✔": [
      {
        tables: ["hours_exceptions", "hours_sets"],
        ops: ["insert", "update", "delete"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
    ],
    propose: [
      {
        tables: ["change_requests"],
        ops: ["select", "insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "confirm-only direct (D10) + propose": [
      // D10 direct-publish exception: hours-confirmation ack only. The ack
      // columns land with the vendor portal (Slice 3); shape is encoded now.
      {
        tables: ["hours_sets"],
        ops: ["update"],
        predicate: { kind: "columnScoped", columns: ["confirmed_at", "confirmed_by"] },
        aal: "none",
      },
      {
        tables: ["change_requests"],
        ops: ["select", "insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    observe: [
      {
        tables: ["observed_statuses"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "✖": [],
  },

  "Menu upload/extract": {
    "✔": [
      {
        tables: MENU_STRUCTURE_TABLES,
        ops: ["insert", "update", "delete"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
      {
        // creating locale rows for a new version (status stays at its
        // default — the status columns are PROTECTED)
        tables: ["menu_version_locales"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
    ],
    "✔ (on behalf)": [
      {
        tables: MENU_STRUCTURE_TABLES,
        ops: ["insert", "update", "delete"],
        predicate: { kind: "all" },
        aal: "none",
      },
      {
        tables: ["menu_version_locales"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "✖": [],
  },

  "Translation edit/QA approve": {
    "✔": [
      {
        tables: LOCALE_CONTENT_TABLES,
        ops: ["insert", "update", "delete"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
    ],
    "✔ (own locale)": [
      {
        tables: LOCALE_CONTENT_TABLES,
        ops: ["insert", "update"],
        predicate: { kind: "ownLocale", column: "locale" },
        aal: "none",
      },
    ],
    "✖": [],
  },

  "Vendor approval of menu": {
    // All approval recording flows through the guarded fn — role/aal/
    // approval-type enforcement lives there (migration 16), not in RLS.
    "record external (D1)": [
      {
        tables: ["menu_version_locales"],
        ops: [],
        predicate: { kind: "fnOwned", fn: "transition_menu_version_locale" },
        aal: "mfa",
      },
    ],
    "record external": [
      {
        tables: ["menu_version_locales"],
        ops: [],
        predicate: { kind: "fnOwned", fn: "transition_menu_version_locale" },
        aal: "none",
      },
    ],
    "—": [
      {
        tables: ["menu_version_locales"],
        ops: [],
        predicate: { kind: "fnOwned", fn: "transition_menu_version_locale" },
        aal: "mfa",
      },
    ],
    "✔": [
      {
        tables: ["menu_version_locales"],
        ops: [],
        predicate: { kind: "fnOwned", fn: "transition_menu_version_locale" },
        aal: "none",
      },
    ],
    "✔ if granted": [
      {
        tables: ["menu_version_locales"],
        ops: [],
        predicate: { kind: "fnOwned", fn: "transition_menu_version_locale" },
        aal: "none",
      },
    ],
    "✖": [],
  },

  "Publish/unpublish": {
    "✔": [
      {
        tables: ["listing_locales", "listings", "menu_version_locales"],
        ops: [],
        predicate: {
          kind: "fnOwned",
          fn: "publish_listing_locale / unpublish_listing_locale / transition_menu_version_locale / transition_listing_locale",
        },
        aal: "mfa",
      },
    ],
    "✖": [],
  },

  "Photos: upload / moderate": {
    "✔/✔": [
      {
        tables: ["media"],
        ops: ["insert", "update", "delete"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
      {
        tables: ["listing_media"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
      {
        tables: ["listing_media"],
        ops: [],
        predicate: { kind: "fnOwned", fn: "replace_listing_photo" },
        aal: "mfa",
      },
    ],
    "✔/✖": [
      // upload only: media begins pending (migration guard); attachment and
      // moderation remain privileged workflows.
      {
        tables: ["media"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "✖": [],
  },

  "Deals: create / approve / kill": {
    "✔": [
      {
        tables: ["deal_locales", "deals"],
        ops: ["insert", "update", "delete"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
    ],
    "✔/✔/✔": [
      {
        tables: ["deal_locales", "deals"],
        ops: ["insert", "update", "delete"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
    ],
    draft: [
      {
        tables: ["deals"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    request: [
      {
        tables: ["deals"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "✖": [],
  },

  "Claims: review/resolve disputes": {
    "✔": [
      {
        tables: ["claims"],
        ops: ["select", "update"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
    ],
    triage: [
      {
        tables: ["claims"],
        ops: ["select", "update"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "✖": [],
    "—": [],
  },

  "Billing admin (vendor side)": {
    "✔": [
      {
        tables: ["subscriptions"],
        ops: ["select"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "if granted": [
      {
        tables: ["subscriptions"],
        ops: ["select"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "—": [],
  },

  "Billing exceptions (platform)": {
    "✔": [
      {
        tables: ["subscriptions"],
        ops: ["select", "update"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
    ],
    view: [
      {
        tables: ["subscriptions"],
        ops: ["select"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "✖": [],
    "—": [],
  },

  "Taxonomy CRUD/merge": {
    "✔": [
      {
        tables: ["categories", "category_locales"],
        ops: ["insert", "update", "delete"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
    ],
    request: [
      {
        tables: ["change_requests"],
        ops: ["select", "insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "✖": [],
  },

  "User/role management": {
    "✔": [
      {
        tables: ["user_roles"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "mfa",
      },
      {
        tables: ["user_roles"],
        ops: [],
        predicate: { kind: "fnOwned", fn: "revoke_platform_role" },
        aal: "mfa",
      },
    ],
    "invite managers (D8)": [
      {
        tables: ["organization_memberships"],
        ops: ["insert"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "✖": [],
  },

  "Audit log read": {
    "✔": [
      {
        tables: ["audit_log"],
        ops: ["select"],
        predicate: { kind: "all" },
        aal: "none",
      },
    ],
    "own scope": [
      {
        tables: ["audit_log"],
        ops: ["select"],
        predicate: { kind: "ownRows", actorColumn: "actor" },
        aal: "none",
      },
    ],
    "own org": [
      // org-scoped audit read arrives with organization_memberships (Slice 3)
      {
        tables: ["audit_log"],
        ops: [],
        predicate: { kind: "fnOwned", fn: "org-scoped read — Slice 3" },
        aal: "none",
      },
    ],
    "own items": [
      {
        tables: ["audit_log"],
        ops: ["select"],
        predicate: { kind: "ownRows", actorColumn: "actor" },
        aal: "none",
      },
    ],
  },
};

export interface ExtraSurface {
  description: string;
  roles: Role[];
  tables: TableName[];
  ops: Op[];
  predicate: Predicate;
  aal: "mfa" | "none";
}

const STAFF_ROLES: Role[] = [
  "super_admin",
  "publisher",
  "editor",
  "language_reviewer_ja",
  "language_reviewer_ko",
  "ops_agent",
];

/**
 * Surfaces the PRD matrix does not model (it has one read row — audit log).
 * Platform infrastructure decisions, reviewed here as one block; the
 * independent invariants suite asserts them straight from PRD/slice-plan
 * prose.
 */
export const EXTRA_SURFACES: ExtraSurface[] = [
  {
    description:
      "Staff read: every platform role reads all live content tables (working visibility; anon/vendors get nothing)",
    roles: STAFF_ROLES,
    tables: [
      "app_config",
      "categories",
      "category_locales",
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
      "slug_aliases",
    ],
    ops: ["select"],
    predicate: { kind: "all" },
    aal: "none",
  },
  {
    description: "Every authenticated user sees their own role grants",
    roles: STAFF_ROLES,
    tables: ["user_roles"],
    ops: ["select"],
    predicate: { kind: "ownRows", actorColumn: "user_id" },
    aal: "none",
  },
  {
    description: "super_admin reads all role grants (User/role management)",
    roles: ["super_admin"],
    tables: ["user_roles"],
    ops: ["select"],
    predicate: { kind: "all" },
    aal: "none",
  },
  {
    description:
      "app_config + markets governance: super_admin only, aal2 (PRD §22 config discipline; reference data)",
    roles: ["super_admin"],
    tables: ["app_config", "markets"],
    ops: ["insert", "update", "delete"],
    predicate: { kind: "all" },
    aal: "mfa",
  },
  {
    description: "provenance writes are fn-owned (upsert_provenance, migration 12)",
    roles: STAFF_ROLES,
    tables: ["provenance"],
    ops: [],
    predicate: { kind: "fnOwned", fn: "upsert_provenance" },
    aal: "none",
  },
];
