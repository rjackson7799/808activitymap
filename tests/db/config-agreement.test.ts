import { describe, expect, it } from "vitest";
import { sql, withRollback, expectErrorIn } from "./helpers";
import {
  APP_CONFIG_REGISTRY,
  parseAppConfig,
  type AppConfigKey,
} from "@/config/app-config";
import { LOCALES } from "@/lib/locales";

/**
 * Cross-layer agreement suites: the §22 values live ONCE (registry
 * devDefaults); the seed and the DB CHECKs must agree with the TS layer.
 */

describe("app_config seed ↔ registry agreement", () => {
  it("every registry key is seeded, every seeded key is registered, values equal devDefaults", async () => {
    const rows = await sql`select key, value from app_config order by key`;
    const dbMap = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    const registryKeys = Object.keys(APP_CONFIG_REGISTRY).sort();
    expect(Object.keys(dbMap).sort()).toEqual(registryKeys);

    for (const key of registryKeys as AppConfigKey[]) {
      expect(dbMap[key], `seeded value for ${key}`).toEqual(
        APP_CONFIG_REGISTRY[key].devDefault,
      );
    }
  });

  it("the seeded rows satisfy the production fail-closed loader", () => {
    // if this passes, a prod boot against these rows would not throw
    return sql`select key, value from app_config`.then((rows) => {
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      expect(() => parseAppConfig(map, "production")).not.toThrow();
    });
  });
});

describe("locale allowlist ↔ DB CHECK agreement", () => {
  it.each(LOCALES)("locale %s passes the DB CHECKs", async (locale) => {
    await withRollback(async (tx) => {
      const cat = await tx`insert into categories (sort, active, publicly_visible)
                           values (99, true, false) returning id`;
      await tx`insert into category_locales (category_id, locale, label, slug)
               values (${cat[0]!.id}, ${locale}, 'T', ${"allowlist-t-" + locale})`;
    });
  });

  it("a locale outside the allowlist fails the DB CHECK", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /locale_check/, (sp) =>
        sp`insert into category_locales (category_id, locale, label, slug)
           values ('e0000000-0000-4000-8000-000000000021', 'fr', 'T', 't-fr')`,
      );
    });
  });

  it("every locale-bearing table constrains to the same allowlist", async () => {
    const checks = await sql`
      select conrelid::regclass::text as table_name, pg_get_constraintdef(oid) as def
      from pg_constraint
      where conname like '%locale_check'
      order by 1`;
    expect(checks.length).toBeGreaterThanOrEqual(6);
    for (const c of checks) {
      for (const locale of LOCALES) {
        expect(c.def, `${c.table_name} must allow ${locale}`).toContain(`'${locale}'`);
      }
    }
  });
});

describe("markets reference data", () => {
  it("the launch market exists in every environment (migration, not seed)", async () => {
    const rows = await sql`select id, timezone from markets where id = 'oahu-waikiki'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.timezone).toBe("Pacific/Honolulu");
  });
});
