import { describe, expect, it } from "vitest";
import { buildModel, type Expectation } from "@/db/rls/model";
import { ROLES, type Role } from "@/db/rls/matrix";
import { LIVE_TABLES } from "@/db/rls/availability";
import { expectErrorIn, sql, type TxSql } from "./helpers";

/**
 * MODEL-DRIVEN RLS SUITE (suite a of two — ADR-003).
 *
 * Shares db/rls/model.ts with the generator, so it does NOT re-derive the
 * PRD: it verifies everything DOWNSTREAM of the model — SQL rendering,
 * policy/grant emission, and Postgres's actual runtime behavior — for every
 * (role × live table × op). Matrix-reading mistakes are the job of
 * rls-invariants.test.ts, which imports nothing from db/rls.
 *
 * Deny semantics matter (pg15):
 *  - no grant            → statement fails: /permission denied/
 *  - grant, no policy hit → SELECT returns 0 rows; INSERT raises
 *    /row-level security/; UPDATE/DELETE succeed touching 0 rows — the
 *    assertions below use count === 0, NEVER absence-of-error.
 */

const model = buildModel();

// ── probe family (fixed UUIDs, distinct from seed's; rolled back per test) ──
const P = {
  actor: "77000000-0000-4000-8000-000000000001",
  other: "77000000-0000-4000-8000-000000000002",
  org: "77000000-0000-4000-8000-000000000011",
  loc: "77000000-0000-4000-8000-000000000012",
  loc2: "77000000-0000-4000-8000-000000000013",
  loc3: "77000000-0000-4000-8000-000000000025",
  listing: "77000000-0000-4000-8000-000000000014",
  listing2: "77000000-0000-4000-8000-000000000015",
  cat: "77000000-0000-4000-8000-000000000016",
  cat2: "77000000-0000-4000-8000-000000000017",
  hoursSet: "77000000-0000-4000-8000-000000000018",
  hoursEx: "77000000-0000-4000-8000-000000000019",
  media: "77000000-0000-4000-8000-00000000001a",
  media2: "77000000-0000-4000-8000-00000000001b",
  mediaSrc: "77000000-0000-4000-8000-00000000001c",
  doc: "77000000-0000-4000-8000-00000000001d",
  version: "77000000-0000-4000-8000-00000000001e",
  mvlJa: "77000000-0000-4000-8000-00000000001f",
  section: "77000000-0000-4000-8000-000000000020",
  section2: "77000000-0000-4000-8000-000000000021",
  item: "77000000-0000-4000-8000-000000000022",
  item2: "77000000-0000-4000-8000-000000000023",
  alias: "77000000-0000-4000-8000-000000000024",
  org2: "77000000-0000-4000-8000-000000000026",
};
const PROBE_SESSION = "77000000-0000-4000-8000-000000000099";
const LIVE_DATABASE_ROLES = new Set([
  "super_admin",
  "publisher",
  "editor",
  "language_reviewer_ja",
  "language_reviewer_ko",
  "ops_agent",
  "contributor",
]);

/** One row (or a locale-free "secondary parent") per live table. */
async function seedProbeFamily(tx: TxSql): Promise<void> {
  await tx.unsafe(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
      ('00000000-0000-0000-0000-000000000000', '${P.actor}', 'authenticated', 'authenticated', 'probe-actor@example.invalid', '', now(), now(), now()),
      ('00000000-0000-0000-0000-000000000000', '${P.other}', 'authenticated', 'authenticated', 'probe-other@example.invalid', '', now(), now(), now());
    insert into public.user_roles (user_id, role) values
      ('${P.actor}', 'contributor'), ('${P.other}', 'contributor');
    insert into public.audit_log (actor, actor_source, action, target_table) values
      ('${P.actor}', 'jwt', 'probe_action', 'probe'),
      ('${P.other}', 'jwt', 'probe_action', 'probe');
    insert into public.markets (id, name) values ('probe-market', 'Probe Market');
    insert into public.app_config (key, value, description) values ('probe.rls', '{}'::jsonb, 'probe row');
    insert into public.organizations (id, name) values
      ('${P.org}', 'Probe Org'), ('${P.org2}', 'Probe Org 2');
    insert into public.locations (id, organization_id, address) values
      ('${P.loc}', '${P.org}', '{"street":"1 Probe Way"}'::jsonb),
      ('${P.loc2}', '${P.org}', '{"street":"2 Probe Way"}'::jsonb),
      ('${P.loc3}', '${P.org}', '{"street":"3 Probe Way"}'::jsonb);
    insert into public.listings (id, location_id) values
      ('${P.listing}', '${P.loc}'), ('${P.listing2}', '${P.loc2}');
    insert into public.listing_locales (listing_id, locale, name) values
      ('${P.listing}', 'ja', 'プローブ'), ('${P.listing}', 'ko', '프로브');
    insert into public.categories (id, market_id) values
      ('${P.cat}', 'oahu-waikiki'), ('${P.cat2}', 'oahu-waikiki');
    insert into public.category_locales (category_id, locale, label, slug) values
      ('${P.cat}', 'ja', 'プローブ分類', 'probe-cat-ja'),
      ('${P.cat}', 'ko', '프로브 분류', 'probe-cat-ko');
    insert into public.listing_categories (listing_id, category_id) values
      ('${P.listing}', '${P.cat}');
    insert into public.hours_sets (id, location_id, weekly, unknown) values
      ('${P.hoursSet}', '${P.loc}', '{}'::jsonb, true);
    insert into public.hours_exceptions (id, location_id, date, closed) values
      ('${P.hoursEx}', '${P.loc}', '2026-12-25', true);
    insert into public.media (id, bucket, path, kind) values
      ('${P.media}', 'public-photos', 'probe/a.jpg', 'photo'),
      ('${P.media2}', 'public-photos', 'probe/b.jpg', 'photo'),
      ('${P.mediaSrc}', 'menu-sources', 'probe/menu.pdf', 'menu_source');
    insert into public.media_locales (media_id, locale, alt_text) values
      ('${P.media}', 'ja', 'プローブ写真'), ('${P.media}', 'ko', '프로브 사진');
    insert into public.listing_media (listing_id, media_id) values
      ('${P.listing}', '${P.media}');
    insert into public.menu_documents (id, listing_id, source_media_id) values
      ('${P.doc}', '${P.listing}', '${P.mediaSrc}');
    insert into public.menu_versions (id, menu_document_id, version) values
      ('${P.version}', '${P.doc}', 9);
    insert into public.menu_version_locales (id, menu_version_id, locale) values
      ('${P.mvlJa}', '${P.version}', 'ja');
    insert into public.menu_sections (id, menu_version_id, position) values
      ('${P.section}', '${P.version}', 0), ('${P.section2}', '${P.version}', 1);
    insert into public.menu_section_locales (section_id, locale, name) values
      ('${P.section}', 'ja', '麺'), ('${P.section}', 'ko', '면');
    insert into public.menu_items (id, section_id, position) values
      ('${P.item}', '${P.section}', 0), ('${P.item2}', '${P.section}', 1);
    insert into public.menu_item_locales (item_id, locale, name) values
      ('${P.item}', 'ja', 'プローブ麺'), ('${P.item}', 'ko', '프로브 면');
    insert into public.slug_aliases (id, route_scope, locale, alias_slug, target_id) values
      ('${P.alias}', 'listing', 'ja', 'probe-alias', '${P.listing}');
  `);
}

// ── per-table write probes ──────────────────────────────────────────────────
// update: innocuous self-assign against a probe row (count = rows touched).
// insert: minimal valid row (passes NOT NULL/CHECK so RLS is what decides;
// avoids protected columns so column-scoped grants pass). Locale-scoped
// tables parameterize by locale against a bare secondary parent.
// del: a probe row whose cascade stays inside the family (savepoint-isolated).
interface WriteProbes {
  update: string | ((locale: string) => string);
  insert?: string | ((locale: string) => string);
  del: string;
  localeScoped?: boolean;
  /**
   * Deny-side INSERT normally fails with /row-level security/; tables whose
   * BEFORE triggers validate against RLS-filtered lookups fail earlier with
   * the trigger's own error — still a denial, matched here.
   */
  denyInsertPattern?: RegExp;
}

const PROBES: Record<string, WriteProbes> = {
  app_config: {
    update: `update app_config set value = value where key = 'probe.rls'`,
    insert: `insert into app_config (key, value) values ('probe.insert', '{}'::jsonb)`,
    del: `delete from app_config where key = 'probe.rls'`,
  },
  audit_log: {
    update: `update audit_log set action = action where actor = '${P.actor}'`,
    insert: `insert into audit_log (actor_source, action, target_table) values ('jwt', 'probe', 'probe')`,
    del: `delete from audit_log where actor = '${P.actor}'`,
  },
  categories: {
    update: `update categories set sort = sort where id = '${P.cat}'`,
    insert: `insert into categories (market_id) values ('oahu-waikiki')`,
    del: `delete from categories where id = '${P.cat2}'`,
  },
  category_locales: {
    localeScoped: true,
    update: (l) => `update category_locales set label = label where category_id = '${P.cat}' and locale = '${l}'`,
    insert: (l) => `insert into category_locales (category_id, locale, label, slug) values ('${P.cat2}', '${l}', 'probe', 'probe-c2-${l}')`,
    del: `delete from category_locales where category_id = '${P.cat}' and locale = 'ko'`,
  },
  hours_exceptions: {
    update: `update hours_exceptions set reason = reason where id = '${P.hoursEx}'`,
    insert: `insert into hours_exceptions (location_id, date, closed) values ('${P.loc}', '2027-01-01', true)`,
    del: `delete from hours_exceptions where id = '${P.hoursEx}'`,
  },
  hours_sets: {
    update: `update hours_sets set kitchen_note = kitchen_note where id = '${P.hoursSet}'`,
    insert: `insert into hours_sets (location_id, weekly, unknown) values ('${P.loc2}', '{}'::jsonb, true)`,
    del: `delete from hours_sets where id = '${P.hoursSet}'`,
  },
  listing_categories: {
    update: `update listing_categories set market_id = market_id where listing_id = '${P.listing}'`,
    insert: `insert into listing_categories (listing_id, category_id) values ('${P.listing2}', '${P.cat}')`,
    del: `delete from listing_categories where listing_id = '${P.listing}' and category_id = '${P.cat}'`,
  },
  listing_locales: {
    localeScoped: true,
    update: (l) => `update listing_locales set seo_title = seo_title where listing_id = '${P.listing}' and locale = '${l}'`,
    insert: (l) => `insert into listing_locales (listing_id, locale, name) values ('${P.listing2}', '${l}', 'probe')`,
    del: `delete from listing_locales where listing_id = '${P.listing}' and locale = 'ko'`,
  },
  listing_media: {
    update: `update listing_media set position = position where listing_id = '${P.listing}'`,
    insert: `insert into listing_media (listing_id, media_id) values ('${P.listing2}', '${P.media}')`,
    del: `delete from listing_media where listing_id = '${P.listing}' and media_id = '${P.media}'`,
  },
  listings: {
    // listings has unique(location_id) — the insert probe needs its own bare location
    update: `update listings set price_band = price_band where id = '${P.listing}'`,
    insert: `insert into listings (location_id) values ('${P.loc3}')`,
    del: `delete from listings where id = '${P.listing2}'`,
  },
  locations: {
    // delete targets the bare loc3 — loc/loc2 are referenced by listings (restrict FK)
    update: `update locations set phone = phone where id = '${P.loc}'`,
    insert: `insert into locations (organization_id) values ('${P.org}')`,
    del: `delete from locations where id = '${P.loc3}'`,
  },
  markets: {
    update: `update markets set name = name where id = 'probe-market'`,
    insert: `insert into markets (id, name) values ('probe-insert', 'Probe Insert')`,
    del: `delete from markets where id = 'probe-market'`,
  },
  media: {
    update: `update media set path = path where id = '${P.media}'`,
    insert: `insert into media (bucket, path, kind) values ('public-photos', 'probe/ins.jpg', 'photo')`,
    del: `delete from media where id = '${P.media2}'`,
  },
  media_locales: {
    localeScoped: true,
    update: (l) => `update media_locales set alt_text = alt_text where media_id = '${P.media}' and locale = '${l}'`,
    insert: (l) => `insert into media_locales (media_id, locale, alt_text) values ('${P.media2}', '${l}', 'probe alt')`,
    del: `delete from media_locales where media_id = '${P.media}' and locale = 'ko'`,
  },
  menu_documents: {
    update: `update menu_documents set captured_at = captured_at where id = '${P.doc}'`,
    insert: `insert into menu_documents (listing_id, source_media_id) values ('${P.listing2}', '${P.mediaSrc}')`,
    del: `delete from menu_documents where id = '${P.doc}'`,
  },
  menu_item_locales: {
    localeScoped: true,
    update: (l) => `update menu_item_locales set name = name where item_id = '${P.item}' and locale = '${l}'`,
    insert: (l) => `insert into menu_item_locales (item_id, locale, name) values ('${P.item2}', '${l}', 'probe item')`,
    del: `delete from menu_item_locales where item_id = '${P.item}' and locale = 'ko'`,
  },
  menu_items: {
    update: `update menu_items set position = position where id = '${P.item}'`,
    insert: `insert into menu_items (section_id, position) values ('${P.section}', 99)`,
    del: `delete from menu_items where id = '${P.item2}'`,
  },
  menu_section_locales: {
    localeScoped: true,
    update: (l) => `update menu_section_locales set name = name where section_id = '${P.section}' and locale = '${l}'`,
    insert: (l) => `insert into menu_section_locales (section_id, locale, name) values ('${P.section2}', '${l}', 'probe section')`,
    del: `delete from menu_section_locales where section_id = '${P.section}' and locale = 'ko'`,
  },
  menu_sections: {
    update: `update menu_sections set position = position where id = '${P.section}'`,
    insert: `insert into menu_sections (menu_version_id, position) values ('${P.version}', 99)`,
    del: `delete from menu_sections where id = '${P.section2}'`,
  },
  menu_version_locales: {
    // status/approval columns are PROTECTED — insert takes defaults only
    update: `update menu_version_locales set locale = locale where id = '${P.mvlJa}'`,
    insert: `insert into menu_version_locales (menu_version_id, locale) values ('${P.version}', 'en')`,
    del: `delete from menu_version_locales where id = '${P.mvlJa}'`,
  },
  menu_versions: {
    update: `update menu_versions set version = version where id = '${P.version}'`,
    insert: `insert into menu_versions (menu_document_id, version) values ('${P.doc}', 10)`,
    del: `delete from menu_versions where id = '${P.version}'`,
  },
  organizations: {
    // delete targets the bare org2 — org is referenced by locations (restrict FK)
    update: `update organizations set notes = notes where id = '${P.org}'`,
    insert: `insert into organizations (name) values ('Probe Insert Org')`,
    del: `delete from organizations where id = '${P.org2}'`,
  },
  provenance: {
    update: `update provenance set field = field`,
    insert: `insert into provenance (target_table, target_id, field, supplied_by) values ('listings', '${P.listing}', 'name', 'vendor')`,
    del: `delete from provenance where target_table = 'probe'`,
  },
  slug_aliases: {
    update: `update slug_aliases set market_id = market_id where id = '${P.alias}'`,
    insert: `insert into slug_aliases (route_scope, locale, alias_slug, target_id) values ('listing', 'ja', 'probe-alias-2', '${P.listing}')`,
    del: `delete from slug_aliases where id = '${P.alias}'`,
    denyInsertPattern: /row-level security|does not exist/,
  },
  user_roles: {
    update: `update user_roles set granted_by = granted_by where user_id = '${P.other}'`,
    insert: `insert into user_roles (user_id, role) values ('${P.other}', 'ops_agent')`,
    del: `delete from user_roles where user_id = '${P.other}' and role = 'contributor'`,
  },
};

const OTHER_LOCALE: Record<string, string> = { ja: "ko", ko: "ja" };

const claimsFor = (role: Role | null, aal: "aal1" | "aal2") =>
  JSON.stringify({
    role: "authenticated",
    sub: P.actor,
    session_id: PROBE_SESSION,
    aal,
    app_roles: role ? [role] : [],
  });

/** Open one probe tx for a role: seed family (superuser), set claims + role. */
async function withRoleProbe(
  role: Role,
  aal: "aal1" | "aal2",
  fn: (tx: TxSql) => Promise<void>,
): Promise<void> {
  class Rollback extends Error {}
  await sql
    .begin(async (tx) => {
      await seedProbeFamily(tx as TxSql);
      if (role && LIVE_DATABASE_ROLES.has(role)) {
        await tx`
          insert into public.user_roles (user_id, role)
          values (${P.actor}::uuid, ${role})
          on conflict (user_id, role) do nothing`;
      }
      await tx`
        insert into auth.sessions (id, user_id)
        values (${PROBE_SESSION}::uuid, ${P.actor}::uuid)`;
      await tx`select set_config('request.jwt.claims', ${claimsFor(role, aal)}, true)`;
      await tx.unsafe("set local role authenticated");
      await fn(tx as TxSql);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

const count = async (tx: TxSql, statement: string): Promise<number> => {
  const result = await tx.unsafe(statement);
  return result.count;
};

/** Successful savepoints RELEASE (persist into the tx) — a delete probe
 * would cascade probe-family rows away from later tables. This marker makes
 * every write probe roll back, success or not, while carrying the count out. */
class ProbeRollback extends Error {
  constructor(public touched: number) {
    super("__probe_rollback__");
  }
}

async function runStatementRolledBack(tx: TxSql, statement: string): Promise<number> {
  try {
    await tx.savepoint(async (sp) => {
      const result = await sp.unsafe(statement);
      throw new ProbeRollback(result.count);
    });
  } catch (e) {
    if (e instanceof ProbeRollback) return e.touched;
    throw e;
  }
  throw new Error("unreachable");
}

async function runWriteProbe(
  tx: TxSql,
  exp: Expectation,
  statement: string,
  expectAllowed: boolean,
  denyInsertPattern?: RegExp,
): Promise<void> {
  const label = `${exp.role} ${exp.op} ${exp.table}`;
  if (exp.op === "insert") {
    if (expectAllowed) {
      await runStatementRolledBack(tx, statement); // throws on any real error
    } else {
      await expectErrorIn(tx, denyInsertPattern ?? /row-level security/, (sp) =>
        sp.unsafe(statement),
      );
    }
    return;
  }
  const touched = await runStatementRolledBack(tx, statement);
  if (expectAllowed) {
    expect(touched, `${label}: expected rows touched`).toBeGreaterThan(0);
  } else {
    expect(touched, `${label}: expected 0 rows touched (RLS-invisible)`).toBe(0);
  }
}

async function runExpectation(tx: TxSql, exp: Expectation): Promise<void> {
  const probes = PROBES[exp.table];
  if (!probes) throw new Error(`no probes for ${exp.table}`);
  const label = `${exp.role} ${exp.op} ${exp.table}`;

  // ── SELECT ────────────────────────────────────────────────────────────
  if (exp.op === "select") {
    if (exp.outcome === "deny-grant") {
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp.unsafe(`select * from ${exp.table} limit 1`),
      );
      return;
    }
    if (exp.scope?.kind === "ownRows") {
      const col = exp.scope.actorColumn;
      const own = await count(tx, `select * from ${exp.table} where ${col} = '${P.actor}'`);
      const foreign = await count(
        tx,
        `select * from ${exp.table} where ${col} is distinct from '${P.actor}'`,
      );
      expect(own, `${label}: own rows visible`).toBeGreaterThan(0);
      expect(foreign, `${label}: foreign rows must be invisible`).toBe(0);
      return;
    }
    const visible = await count(tx, `select * from ${exp.table}`);
    if (exp.outcome === "allow") {
      expect(visible, `${label}: rows visible`).toBeGreaterThan(0);
    } else {
      expect(visible, `${label}: zero rows (RLS deny)`).toBe(0);
    }
    return;
  }

  // ── writes ────────────────────────────────────────────────────────────
  if (exp.outcome === "deny-grant") {
    const probe = probes[exp.op === "delete" ? "del" : exp.op];
    if (!probe) throw new Error(`no ${exp.op} probe for ${exp.table}`);
    const statement = typeof probe === "function" ? probe("ja") : probe;
    await expectErrorIn(tx, /permission denied/, (sp) => sp.unsafe(statement));
    return;
  }

  if (exp.op === "delete") {
    await runWriteProbe(tx, exp, probes.del, exp.outcome === "allow");
    return;
  }

  const probe = probes[exp.op];
  if (!probe) throw new Error(`no ${exp.op} probe for ${exp.table}`);

  if (exp.outcome === "allow" && exp.scope?.kind === "locale") {
    const fn = probe as (l: string) => string;
    await runWriteProbe(tx, exp, fn(exp.scope.locale), true);
    await runWriteProbe(tx, exp, fn(OTHER_LOCALE[exp.scope.locale]!), false, probes.denyInsertPattern);
    return;
  }
  // unscoped roles on locale tables: UPDATE must hit an existing row (ja);
  // INSERT must use a free locale (en — the family seeds only ja/ko)
  const statement =
    typeof probe === "function" ? probe(exp.op === "insert" ? "en" : "ja") : probe;
  await runWriteProbe(tx, exp, statement, exp.outcome === "allow", probes.denyInsertPattern);
}

// ── inventory ───────────────────────────────────────────────────────────────

describe("policy inventory matches the model exactly", () => {
  it("pg_policies == manifest: same names, tables, commands — nothing extra, nothing missing", async () => {
    const live = await sql`
      select tablename, policyname, lower(cmd) as cmd
      from pg_policies
      where schemaname = 'public'`;
    // sort BOTH sides with the same comparator (SQL vs JS collation differs)
    const key = (t: string, n: string, c: string) => JSON.stringify([t, n, c]);
    const actual = live.map((r) => key(r.tablename, r.policyname, r.cmd)).sort();
    const expected = model.policies.map((p) => key(p.table, p.name, p.op)).sort();
    expect(actual).toEqual(expected);
  });

  it("all policies target only role `authenticated` (anon has none, ADR-004)", async () => {
    const rows = await sql`
      select policyname, roles from pg_policies
      where schemaname = 'public' and roles <> '{authenticated}'`;
    expect(rows).toEqual([]);
  });
});

describe("grant inventory matches the model", () => {
  it("has_table_privilege / has_any_column_privilege per (table, op)", async () => {
    for (const g of model.grants) {
      for (const op of ["select", "insert", "update", "delete"] as const) {
        const mode = g.ops[op];
        // column privileges exist only for select/insert/update — DELETE is
        // table-level only in Postgres
        const columnCapable = op !== "delete";
        const [row] = columnCapable
          ? await sql`
              select
                has_table_privilege('authenticated', ${"public." + g.table}, ${op}) as tbl,
                has_any_column_privilege('authenticated', ${"public." + g.table}, ${op}) as col`
          : await sql`
              select
                has_table_privilege('authenticated', ${"public." + g.table}, ${op}) as tbl,
                has_table_privilege('authenticated', ${"public." + g.table}, ${op}) as col`;
        if (mode === "full") {
          expect(row!.tbl, `${g.table} ${op}: full table grant`).toBe(true);
        } else if (mode === "columns") {
          expect(row!.tbl, `${g.table} ${op}: must NOT be table-wide`).toBe(false);
          expect(row!.col, `${g.table} ${op}: column grant present`).toBe(true);
        } else {
          expect(row!.col, `${g.table} ${op}: no grant at all`).toBe(false);
        }
      }
    }
  });

  it("protected columns are excluded from INSERT and UPDATE grants; siblings are granted", async () => {
    for (const g of model.grants) {
      if (!g.protectedColumns) continue;
      for (const column of g.protectedColumns) {
        for (const op of ["insert", "update"] as const) {
          if (!g.ops[op]) continue;
          const [row] = await sql`
            select has_column_privilege('authenticated', ${"public." + g.table}, ${column}, ${op}) as priv`;
          expect(row!.priv, `${g.table}.${column} ${op} must be denied`).toBe(false);
        }
      }
    }
    const [sibling] = await sql`
      select has_column_privilege('authenticated', 'public.listings', 'price_band', 'update') as priv`;
    expect(sibling!.priv).toBe(true);
  });

  it("events family remains fully revoked (not a live table)", async () => {
    const partitions = await sql`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'events%'`;
    expect(partitions.length).toBeGreaterThan(0);
    for (const { relname } of partitions) {
      const [row] = await sql`
        select has_any_column_privilege('authenticated', ${"public." + relname}, 'select') as priv`;
      expect(row!.priv, `${relname} must stay revoked`).toBe(false);
    }
  });
});

// ── behavioral: every (role × live table × op) at aal2 ─────────────────────

describe("behavior matches expectations (aal2 session)", () => {
  for (const role of ROLES) {
    it(`${role}: ${LIVE_TABLES.length} tables × 4 ops`, async () => {
      const expectations = model.expectations.filter((e) => e.role === role);
      expect(expectations).toHaveLength(LIVE_TABLES.length * 4);
      await withRoleProbe(role, "aal2", async (tx) => {
        for (const exp of expectations) {
          await runExpectation(tx, exp);
        }
      });
    });
  }

  it("a role-less authenticated JWT gets zero rows and no writes anywhere", async () => {
    await withRoleProbe(null as unknown as Role, "aal2", async (tx) => {
      for (const table of LIVE_TABLES) {
        const visible = await count(tx, `select * from ${table}`);
        expect(visible, `role-less select ${table}`).toBe(0);
      }
    });
  });
});

// ── aal boundary: every aal2-required allow is denied at aal1 ───────────────

describe("aal2 boundary — MFA follows the actor to the DB", () => {
  const mfaRoles = [...new Set(
    model.expectations
      .filter((e) => e.outcome === "allow" && e.aal2Required)
      .map((e) => e.role),
  )];

  for (const role of mfaRoles) {
    it(`${role}@aal1: every aal2-required write is denied`, async () => {
      const gated = model.expectations.filter(
        (e) => e.role === role && e.outcome === "allow" && e.aal2Required && e.op !== "select",
      );
      expect(gated.length).toBeGreaterThan(0);
      await withRoleProbe(role, "aal1", async (tx) => {
        for (const exp of gated) {
          await runExpectation(tx, { ...exp, outcome: "deny-rls" });
        }
      });
    });
  }

  it("reviewer own-locale writes do NOT require aal2 (not MFA-mandated roles)", async () => {
    await withRoleProbe("language_reviewer_ja", "aal1", async (tx) => {
      const touched = await count(
        tx,
        (PROBES.listing_locales!.update as (l: string) => string)("ja"),
      );
      expect(touched).toBe(1);
    });
  });
});
