import { describe, expect, it } from "vitest";
import { expectErrorIn, setClaims, sql, withClaims, withRollback, type TxSql } from "./helpers";
import { ACTOR, CATEGORY, LISTING, ORG } from "./fixtures";

/**
 * INDEPENDENT PRD §4 INVARIANTS (suite b of two — ADR-003).
 *
 * Every expectation below is transcribed BY HAND from PRD §4 (+ the slice-1
 * §RLS invariant list). This file must NEVER import from db/rls/ — it is the
 * check against self-validation: if matrix.ts or semantics.ts drift from the
 * PRD, this suite catches it even when the generator and the model-driven
 * suite agree with each other.
 *
 * Interpretations pinned here (ADR-001/ADR-003):
 *  - "—" on "Vendor approval of menu" for publisher/super_admin = N/A, not
 *    deny: they keep the strictly-stronger publish right, so recording
 *    external approval stays permitted.
 *  - "own scope" audit read = actor = auth.uid() in Slice 1.
 */

const touched = async (tx: TxSql, statement: string): Promise<number> => {
  const result = await tx.unsafe(statement);
  return result.count;
};

describe("publication state is publisher-only and fn-owned (PRD §4 Publish/unpublish, §6)", () => {
  it("publisher@aal2 cannot flip listings.publication_status by direct UPDATE (column grant)", async () => {
    await withClaims(
      { sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" },
      async (tx) => {
        await expectErrorIn(tx, /permission denied/, (sp) =>
          sp`update listings set publication_status = 'unpublished' where id = ${LISTING.ramen}`,
        );
        await expectErrorIn(tx, /permission denied/, (sp) =>
          sp`update listing_locales set status = 'published' where listing_id = ${LISTING.coffee} and locale = 'en'`,
        );
      },
    );
  });

  it("editor@aal2 cannot INSERT a listing_locale born published (column grant on INSERT)", async () => {
    await withClaims({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`insert into listing_locales (listing_id, locale, status, name)
           values (${LISTING.coffee}, 'ko', 'published', 'smuggled')`,
      );
    });
  });

  it("nobody sets menu approval evidence columns directly — not even publisher@aal2", async () => {
    await withClaims(
      { sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" },
      async (tx) => {
        await expectErrorIn(tx, /permission denied/, (sp) =>
          sp`update menu_version_locales set approved_by = ${ACTOR.publisher} where locale = 'ko'`,
        );
        await expectErrorIn(tx, /permission denied/, (sp) =>
          sp`update menu_version_locales set status = 'published' where locale = 'ko'`,
        );
      },
    );
  });

  it("editor@aal2 cannot update listings.publication_status either (not only publishers are blocked)", async () => {
    await withClaims({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`update listings set publication_status = 'published' where id = ${LISTING.coffee}`,
      );
    });
  });
});

describe("editor (PRD §4: facts ✔, translation ✖, publish ✖)", () => {
  it("edits business facts at aal2", async () => {
    await withClaims({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      const n = await touched(
        tx,
        `update organizations set notes = 'editor was here' where id = '${ORG.ramen}'`,
      );
      expect(n).toBe(1);
    });
  });

  it("cannot edit business facts at aal1 (MFA-mandated role)", async () => {
    await withClaims({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal1" }, async (tx) => {
      const n = await touched(
        tx,
        `update organizations set notes = 'no mfa' where id = '${ORG.ramen}'`,
      );
      expect(n).toBe(0);
    });
  });

  it("cannot touch locale content — not even EN (translation row is ✖ for editor)", async () => {
    await withClaims({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      const n = await touched(
        tx,
        `update listing_locales set seo_title = 'x' where listing_id = '${LISTING.ramen}' and locale = 'en'`,
      );
      expect(n).toBe(0);
      await expectErrorIn(tx, /row-level security/, (sp) =>
        sp`insert into listing_locales (listing_id, locale, name) values (${LISTING.coffee}, 'ko', 'editor smuggle')`,
      );
    });
  });
});

describe("language reviewers (PRD §4: ✔ own locale; not MFA-mandated)", () => {
  it("ja reviewer edits a ja row at aal1 — and cannot touch ko", async () => {
    await withClaims(
      { sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" },
      async (tx) => {
        const ja = await touched(
          tx,
          `update listing_locales set seo_title = 'レビュー済み' where listing_id = '${LISTING.ramen}' and locale = 'ja'`,
        );
        expect(ja).toBe(1);
        const ko = await touched(
          tx,
          `update listing_locales set seo_title = 'x' where listing_id = '${LISTING.ramen}' and locale = 'ko'`,
        );
        expect(ko).toBe(0);
      },
    );
  });

  it("cannot re-assign a ja row to locale='ko' (WITH CHECK blocks the write side)", async () => {
    await withClaims(
      { sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" },
      async (tx) => {
        await expectErrorIn(tx, /row-level security/, (sp) =>
          sp`update listing_locales set locale = 'ko' where listing_id = ${LISTING.coffee} and locale = 'ja'`,
        );
      },
    );
  });

  it("cannot flip workflow status even on their own locale (column grant)", async () => {
    await withClaims(
      { sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" },
      async (tx) => {
        await expectErrorIn(tx, /permission denied/, (sp) =>
          sp`update listing_locales set status = 'qa_approved' where listing_id = ${LISTING.coffee} and locale = 'ja'`,
        );
      },
    );
  });

  it("cannot edit business facts or taxonomy", async () => {
    await withClaims(
      { sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal2" },
      async (tx) => {
        expect(await touched(tx, `update locations set phone = '808' where id is not null`)).toBe(0);
        expect(await touched(tx, `update categories set sort = 99 where id = '${CATEGORY.ramen}'`)).toBe(0);
      },
    );
  });
});

describe("ops_agent (PRD §4: propose-only facts, menu upload on behalf, photos upload/✖ moderate)", () => {
  const opsClaims = { sub: ACTOR.admin, app_roles: ["ops_agent"], aal: "aal1" as const };

  it("reads listings but cannot mutate business facts anywhere (change_requests arrive Slice 3)", async () => {
    await withClaims(opsClaims, async (tx) => {
      const visible = await tx`select count(*)::int as c from listings`;
      expect(visible[0]!.c).toBeGreaterThan(0);
      expect(await touched(tx, `update listings set price_band = '$' where id = '${LISTING.ramen}'`)).toBe(0);
      expect(await touched(tx, `update locations set phone = 'x' where id is not null`)).toBe(0);
      await expectErrorIn(tx, /row-level security/, (sp) =>
        sp`insert into organizations (name) values ('ops direct org')`,
      );
    });
  });

  it("uploads menus on behalf (menu_documents insert, no aal2 needed)", async () => {
    await withClaims(opsClaims, async (tx) => {
      // reuses the seeded menu-source media
      await tx`insert into menu_documents (listing_id, source_media_id)
               values (${LISTING.sushi}, 'f0000000-0000-4000-8000-000000000003')`;
      const rows = await tx`select count(*)::int as c from menu_documents where listing_id = ${LISTING.sushi}`;
      expect(rows[0]!.c).toBe(1);
    });
  });

  it("uploads photos but cannot moderate (no media UPDATE)", async () => {
    await withClaims(opsClaims, async (tx) => {
      await tx`insert into media (bucket, path, kind) values ('public-photos', 'ops/upload.jpg', 'photo')`;
      expect(
        await touched(tx, `update media set moderation_status = 'approved' where kind = 'photo'`),
      ).toBe(0);
    });
  });

  it("cannot touch taxonomy or roles", async () => {
    await withClaims({ ...opsClaims, aal: "aal2" }, async (tx) => {
      expect(await touched(tx, `update categories set active = active where id = '${CATEGORY.ramen}'`)).toBe(0);
      await expectErrorIn(tx, /row-level security/, (sp) =>
        sp`insert into user_roles (user_id, role) values (${ACTOR.admin}, 'editor')`,
      );
    });
  });
});

describe("role management is super_admin-only (PRD §4 User/role management)", () => {
  it("publisher@aal2 cannot grant roles; super_admin@aal2 can; super_admin@aal1 cannot", async () => {
    // needs a real auth.users row for the FK — created inside the rollback tx
    const probeUser = "76000000-0000-4000-8000-000000000001";
    await withRollback(async (tx) => {
      await tx.unsafe(`
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', '${probeUser}', 'authenticated', 'authenticated', 'role-probe@example.invalid', '', now(), now(), now())`);

      const as = (roles: string[], aal: "aal1" | "aal2") =>
        setClaims(tx, { sub: ACTOR.admin, app_roles: roles, aal }, true);

      await as(["publisher"], "aal2");
      await expectErrorIn(tx, /row-level security/, (sp) =>
        sp`insert into user_roles (user_id, role) values (${probeUser}, 'editor')`,
      );

      await as(["super_admin"], "aal1");
      await expectErrorIn(tx, /row-level security/, (sp) =>
        sp`insert into user_roles (user_id, role) values (${probeUser}, 'editor')`,
      );

      await as(["super_admin"], "aal2");
      await tx`insert into user_roles (user_id, role) values (${probeUser}, 'editor')`;
      const rows = await tx`select role from user_roles where user_id = ${probeUser}`;
      expect(rows.map((r) => r.role)).toEqual(["editor"]);
    });
  });
});

describe("taxonomy mutation is publisher+-only (PRD §4 Taxonomy CRUD/merge)", () => {
  it("publisher@aal2 mutates categories; editor/ops/reviewer cannot", async () => {
    await withClaims(
      { sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" },
      async (tx) => {
        expect(await touched(tx, `update categories set sort = 42 where id = '${CATEGORY.cafe}'`)).toBe(1);
        expect(
          await touched(tx, `update category_locales set label = label where category_id = '${CATEGORY.cafe}' and locale = 'en'`),
        ).toBe(1);
      },
    );
    for (const role of ["editor", "ops_agent"]) {
      await withClaims({ sub: ACTOR.admin, app_roles: [role], aal: "aal2" }, async (tx) => {
        expect(
          await touched(tx, `update categories set sort = 43 where id = '${CATEGORY.cafe}'`),
          `${role} must not mutate taxonomy`,
        ).toBe(0);
      });
    }
  });

  it("publisher@aal1 cannot mutate taxonomy (MFA-mandated role)", async () => {
    await withClaims(
      { sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal1" },
      async (tx) => {
        expect(await touched(tx, `update categories set sort = 44 where id = '${CATEGORY.cafe}'`)).toBe(0);
      },
    );
  });
});

describe("record-external menu approval (PRD §4 Vendor approval of menu — '—' reading pinned)", () => {
  // Stage mvl ko at qa_approved, then attempt the approve edge per role.
  const stage = async (tx: TxSql) => {
    await setClaims(tx, { sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" });
    await tx`select transition_menu_version_locale('92000000-0000-4000-8000-000000000003'::uuid, 'qa_pending')`;
    await setClaims(tx, { sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ko"], aal: "aal1" });
    await tx`select transition_menu_version_locale('92000000-0000-4000-8000-000000000003'::uuid, 'qa_approved')`;
  };
  const approveAs = async (
    tx: TxSql,
    roles: string[],
    aal: "aal1" | "aal2",
  ) => {
    await setClaims(tx, { sub: ACTOR.admin, app_roles: roles, aal });
    return tx`select transition_menu_version_locale('92000000-0000-4000-8000-000000000003'::uuid, 'approved', 'vendor_approved_external', 'f0000000-0000-4000-8000-000000000004'::uuid)`;
  };

  it("editor, ops_agent, publisher, super_admin may record external approval @aal2; reviewers may not", async () => {
    for (const roles of [["editor"], ["ops_agent"], ["publisher"], ["super_admin"]]) {
      await withRollback(async (tx) => {
        await stage(tx);
        await approveAs(tx, roles, "aal2");
        const row = await tx`select status from menu_version_locales where id = '92000000-0000-4000-8000-000000000003'`;
        expect(row[0]!.status, roles[0]).toBe("approved");
      });
    }
    await withRollback(async (tx) => {
      await stage(tx);
      await expectErrorIn(tx, /permission_denied/, () =>
        approveAs(tx, ["language_reviewer_ko"], "aal2"),
      );
    });
  });
});

describe("vendor and contributor JWTs are inert in Slice 1 (roles arrive Slice 3)", () => {
  for (const role of ["vendor_owner", "vendor_manager", "contributor"]) {
    it(`${role}: zero rows visible, no writes`, async () => {
      await withClaims({ sub: ACTOR.admin, app_roles: [role], aal: "aal2" }, async (tx) => {
        for (const table of ["listings", "organizations", "media", "menu_documents", "audit_log", "user_roles"]) {
          const rows = await tx.unsafe(`select count(*)::int as c from ${table}`);
          expect(rows[0]!.c, `${role} sees 0 rows of ${table}`).toBe(0);
        }
        expect(await touched(tx, `update listings set price_band = '$' where id = '${LISTING.ramen}'`)).toBe(0);
        await expectErrorIn(tx, /row-level security/, (sp) =>
          sp`insert into media (bucket, path, kind) values ('public-photos', 'vendor/x.jpg', 'photo')`,
        );
      });
    });
  }
});

describe("cross-organization isolation groundwork", () => {
  it("platform staff read across ALL organizations (global staff, not org-scoped)", async () => {
    await withClaims({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal1" }, async (tx) => {
      const orgs = await tx`select id from organizations order by id`;
      expect(orgs.length).toBeGreaterThanOrEqual(3); // all seeded orgs visible
    });
  });

  it("an org-scoped role without live membership infrastructure gets NOTHING from any org", async () => {
    await withClaims({ sub: ACTOR.admin, app_roles: ["vendor_owner"], aal: "aal2" }, async (tx) => {
      const orgs = await tx`select id from organizations`;
      expect(orgs).toEqual([]); // no org-1-reads-org-2 leak is possible: zero rows, period
    });
  });

  it("a role-less authenticated JWT sees nothing either", async () => {
    await withClaims({ sub: ACTOR.admin, app_roles: [], aal: "aal2" }, async (tx) => {
      const orgs = await tx`select id from organizations`;
      expect(orgs).toEqual([]);
    });
  });
});

describe("audit log read scope (PRD §4: ✔ / ✔ / own scope…) — and audit is never writable", () => {
  it("publisher reads everything; editor reads only rows they acted", async () => {
    await withRollback(async (tx) => {
      // produce one row by another actor (superuser update as service)
      await tx`select set_config('app.actor', ${ACTOR.publisher}, true)`;
      await tx`update organizations set notes = 'audit probe' where id = ${ORG.ramen}`;

      const as = async (roles: string[], sub: string) => {
        await setClaims(tx, { sub, app_roles: roles, aal: "aal1" }, true);
      };

      await as(["publisher"], ACTOR.publisher);
      const all = await tx`select count(*)::int as c from audit_log`;
      expect(all[0]!.c).toBeGreaterThan(0);

      await tx.unsafe("reset role");
      await as(["editor"], ACTOR.admin);
      const foreign = await tx`select count(*)::int as c from audit_log where actor is distinct from ${ACTOR.admin}`;
      expect(foreign[0]!.c).toBe(0);
    });
  });

  it("no role can write audit_log — insert/update/delete all lack grants", async () => {
    await withClaims(
      { sub: ACTOR.admin, app_roles: ["super_admin"], aal: "aal2" },
      async (tx) => {
        await expectErrorIn(tx, /permission denied/, (sp) =>
          sp`insert into audit_log (actor_source, action, target_table) values ('jwt', 'forged', 'x')`,
        );
        await expectErrorIn(tx, /permission denied/, (sp) => sp`update audit_log set action = 'x'`);
        await expectErrorIn(tx, /permission denied/, (sp) => sp`delete from audit_log`);
      },
    );
  });
});

describe("public surface unchanged (ADR-004) + structural pins", () => {
  it("anon: permission denied on every public table INCLUDING all events partitions (pg_inherits sweep)", async () => {
    const tables = await sql`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname`;
    const partitions = await sql`
      select c.relname
      from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      join pg_class p on p.oid = i.inhparent
      join pg_namespace n on n.oid = p.relnamespace
      where n.nspname = 'public' and p.relname = 'events'`;
    const all = [...new Set([...tables, ...partitions].map((r) => r.relname))];
    expect(all.length).toBeGreaterThan(25);
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      for (const table of all) {
        await expectErrorIn(tx, /permission denied/, (sp) =>
          sp.unsafe(`select * from public.${table} limit 1`),
        );
      }
    });
  });

  it("publishable_locale_pages: authenticated and anon hold no grant (server-only view)", async () => {
    const [row] = await sql`
      select
        has_table_privilege('authenticated', 'public.publishable_locale_pages', 'select') as auth,
        has_table_privilege('anon', 'public.publishable_locale_pages', 'select') as anon`;
    expect(row).toEqual({ auth: false, anon: false });
  });

  it("FORCE ROW LEVEL SECURITY is disabled everywhere — SECURITY DEFINER fn-owned writes depend on it", async () => {
    const forced = await sql`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relforcerowsecurity`;
    expect(forced).toEqual([]);
  });

  it("the MFA-factor audit trigger is correctly bound and enabled for every factor mutation", async () => {
    const rows = await sql`
      select
        t.tgname,
        t.tgenabled,
        t.tgtype,
        pn.nspname as function_schema,
        p.proname as function_name,
        rn.nspname as relation_schema,
        c.relname as relation_name
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace pn on pn.oid = p.pronamespace
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace rn on rn.oid = c.relnamespace
      where t.tgname = 'audit_mfa_factors'
        and not t.tgisinternal`;
    expect(rows).toEqual([
      expect.objectContaining({
        tgname: "audit_mfa_factors",
        tgenabled: "O",
        tgtype: 29,
        function_schema: "public",
        function_name: "audit_mfa_factor_change",
        relation_schema: "auth",
        relation_name: "mfa_factors",
      }),
    ]);
  });
});
