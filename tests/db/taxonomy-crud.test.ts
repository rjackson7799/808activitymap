import { describe, expect, it } from "vitest";
import { sql, newConnection, withClaims, expectErrorIn } from "./helpers";
import { ACTOR } from "./fixtures";
import { mapDbError } from "@/lib/errors";

/**
 * Taxonomy CRUD at the DB boundary (CP3) — the write paths the admin server
 * actions rely on. RLS behaviour is simulated via JWT-claim GUCs (ADR-003).
 *
 * Note the deliberate handler-vs-RLS asymmetry (ADR-009): the admin ACTIONS
 * are publisher+/aal2 for everything, but RLS additionally lets an own-locale
 * language_reviewer write category_locales (it is a locale-content table).
 * The reviewer-deny cases therefore target `categories` (structure = taxonomy
 * CRUD, publisher+), and a positive case documents the reviewer's legitimate
 * own-locale category_locales access so it is never mistaken for RLS drift.
 */

const publisherAal2 = { sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" as const };
const NEW_CAT = "d1000000-0000-4000-8000-0000000000c1";

describe("taxonomy: publisher write path + audit", () => {
  it("publisher@aal2 creates a category + EN locale, each audited to the actor", async () => {
    await withClaims(publisherAal2, async (tx) => {
      await tx`insert into categories (id, parent_id, sort, publicly_visible)
               values (${NEW_CAT}, null, 9, true)`;
      await tx`insert into category_locales (category_id, locale, label, slug)
               values (${NEW_CAT}, 'en', 'Poke Bowls', 'poke-bowls')`;

      const cat = await tx`select active, publicly_visible from categories where id = ${NEW_CAT}`;
      expect(cat[0]).toMatchObject({ active: true, publicly_visible: true });

      const audits = await tx`
        select target_table, action, actor, actor_source
        from audit_log
        where (target_table = 'categories' and target_id = ${NEW_CAT})
           or (target_table = 'category_locales' and action = 'INSERT'
               and after->>'category_id' = ${NEW_CAT})
        order by target_table`;
      const tables = audits.map((a) => a.target_table);
      expect(tables).toContain("categories");
      expect(tables).toContain("category_locales");
      for (const a of audits) {
        expect(a.action).toBe("INSERT");
        expect(a.actor).toBe(ACTOR.publisher); // auth.uid() from the claims sub
        expect(a.actor_source).toBe("jwt");
      }
    });
  });
});

describe("taxonomy: RLS on categories is publisher+ (PRD §4 Taxonomy CRUD)", () => {
  it("editor@aal2 cannot INSERT a category (structure is publisher+ only)", async () => {
    await withClaims({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      await expectErrorIn(tx, /row-level security/, (sp) =>
        sp`insert into categories (id, sort) values (${NEW_CAT}, 1)`,
      );
    });
  });

  it("publisher@aal1 cannot INSERT a category (MFA follows the actor to the DB)", async () => {
    await withClaims({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal1" }, async (tx) => {
      await expectErrorIn(tx, /row-level security/, (sp) =>
        sp`insert into categories (id, sort) values (${NEW_CAT}, 1)`,
      );
    });
  });

  it("language_reviewer_ja cannot INSERT a category", async () => {
    await withClaims({ sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" }, async (tx) => {
      await expectErrorIn(tx, /row-level security/, (sp) =>
        sp`insert into categories (id, sort) values (${NEW_CAT}, 1)`,
      );
    });
  });
});

describe("taxonomy: category_locales RLS reality (documents handler-stricter posture)", () => {
  it("language_reviewer_ja CAN write its own-locale category_locales (not drift; handler still gates to publisher+)", async () => {
    await withClaims({ sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" }, async (tx) => {
      // seed category 'ramen' exists; reviewer replaces its JA label (own locale)
      const n = await tx`update category_locales set label = 'ラーメン専門'
                         where category_id = 'e0000000-0000-4000-8000-000000000011' and locale = 'ja'`;
      expect(n.count).toBe(1);
    });
  });

  it("language_reviewer_ja CANNOT write a KO category_locale (own-locale only)", async () => {
    await withClaims({ sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" }, async (tx) => {
      const n = await tx`update category_locales set label = 'smuggle'
                         where category_id = 'e0000000-0000-4000-8000-000000000011' and locale = 'ko'`;
      // grant-but-no-matching-policy ⇒ UPDATE silently touches 0 rows (ADR-003)
      expect(n.count).toBe(0);
    });
  });
});

describe("taxonomy: concurrent slug creation resolves to one success + one clean error", () => {
  it("two categories, same (locale, slug): one commits, the other gets a 23505 on the slug unique index", async () => {
    const idA = "d1000000-0000-4000-8000-0000000000a1";
    const idB = "d1000000-0000-4000-8000-0000000000b1";
    const slug = "concurrent-poke";
    const c1 = newConnection();
    const c2 = newConnection();
    let raceError: unknown;

    try {
      // two distinct category shells so the collision is unique(locale, slug),
      // NOT the (category_id, locale) primary key
      await sql`insert into categories (id, sort) values (${idA}, 100), (${idB}, 101)`;

      await c1`begin`;
      await c2`begin`;
      await c1`insert into category_locales (category_id, locale, label, slug)
               values (${idA}, 'en', 'Race A', ${slug})`;
      // c2's insert blocks on the shared unique index until c1 resolves
      const c2Insert = c2`insert into category_locales (category_id, locale, label, slug)
                          values (${idB}, 'en', 'Race B', ${slug})`.catch((e: unknown) => {
        raceError = e;
      });
      await c1`commit`; // winner commits → loser now sees a real conflict
      await c2Insert;
      await c2`rollback`;

      expect(raceError).toBeInstanceOf(Error);
      const err = raceError as { code?: string; constraint_name?: string };
      expect(err.code).toBe("23505");
      expect(err.constraint_name).toBe("category_locales_locale_slug_key");

      // and the loser's error maps to a clean, slug-scoped validation message
      const mapped = mapDbError(raceError);
      expect(mapped).toMatchObject({ code: "duplicate_slug", field: "slug" });
    } finally {
      // committed winner leaves residue — delete both shells (cascade clears
      // the locale row) so re-runs stay clean
      await sql`delete from categories where id in (${idA}, ${idB})`;
      await c1.end();
      await c2.end();
    }
  });

  it("a duplicate slug thrown by a plain insert maps to the slug field (integrated mapper)", async () => {
    // 'ramen'/'ramen' EN slug already exists in the seed
    let thrown: unknown;
    try {
      await sql`insert into categories (id, sort) values (${NEW_CAT}, 200)`;
      await sql`insert into category_locales (category_id, locale, label, slug)
                values (${NEW_CAT}, 'en', 'Dup', 'ramen')`;
    } catch (e) {
      thrown = e;
    } finally {
      await sql`delete from categories where id = ${NEW_CAT}`;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(mapDbError(thrown)).toMatchObject({ code: "duplicate_slug", field: "slug" });
  });
});
