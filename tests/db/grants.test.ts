import { describe, expect, it } from "vitest";
import { sql, withRollback, expectErrorIn } from "./helpers";

/**
 * Anon deny-all everywhere (ADR-004): the public surface reads via
 * server-side functions only; the anon role can read NOTHING. authenticated
 * is deny-all too until CP2's generated policies land (RLS enabled, zero
 * policies).
 */

describe("anon: deny-all on every public table", () => {
  it("anon cannot select from any public table", async () => {
    // includes events partitions — directly addressable, must be deny-all too
    const tables = await sql`
      select tablename from pg_tables
      where schemaname = 'public'
      order by tablename`;
    expect(tables.length).toBeGreaterThan(20);

    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      for (const { tablename } of tables) {
        await expectErrorIn(tx, /permission denied/, (sp) =>
          sp.unsafe(`select * from public."${tablename}" limit 1`),
        );
      }
    });
  });

  it("anon cannot write anywhere (spot checks)", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`insert into events (name, source) values ('spoofed', 'client')`,
      );
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`update listings set publication_status = 'published'`,
      );
    });
  });
});

describe("authenticated: RLS deny-all until CP2 policies", () => {
  it("rows are invisible even where table grants exist", async () => {
    await withRollback(async (tx) => {
      await tx`select set_config('request.jwt.claims', '{"role":"authenticated","sub":"99000000-0000-4000-8000-000000000001"}', true)`;
      await tx.unsafe("set local role authenticated");
      const listings = await tx`select * from listings`;
      const locales = await tx`select * from listing_locales`;
      const config = await tx`select * from app_config`;
      expect(listings).toEqual([]);
      expect(locales).toEqual([]);
      expect(config).toEqual([]);
    });
  });

  it("writes are rejected by RLS", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role authenticated");
      await expectErrorIn(tx, /row-level security/, (sp) =>
        sp`insert into organizations (name) values ('Sneaky Org')`,
      );
    });
  });
});

describe("RLS coverage", () => {
  it("every public table has RLS enabled", async () => {
    const unprotected = await sql`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not c.relrowsecurity`;
    expect(unprotected).toEqual([]);
  });

  it("every public policy is generator-named — no strays (exact inventory: rls-matrix.gen suite)", async () => {
    // CP2: policies exist now, all generated from db/rls (matrix ∧
    // availability). The model-driven suite compares pg_policies against the
    // manifest EXACTLY; here we pin the structural rule that makes the
    // permissive-OR foot-gun impossible: nothing but {table}_{op} names.
    const strays = await sql`
      select c.relname, p.polname from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and p.polname !~ ('^' || c.relname || '_(select|insert|update|delete)$')`;
    expect(strays).toEqual([]);
  });
});

describe("private storage buckets", () => {
  it("menu-sources and evidence have no public read; public-photos is the only public bucket", async () => {
    const buckets = await sql`select id, public from storage.buckets order by id`;
    expect(buckets).toEqual([
      { id: "evidence", public: false },
      { id: "menu-sources", public: false },
      { id: "public-photos", public: true },
    ]);
  });

  it("no select policy exists for the private buckets", async () => {
    const selectPolicies = await sql`
      select p.polname, pg_get_expr(p.polqual, p.polrelid) as qual
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      where c.relname = 'objects' and p.polcmd = 'r'`;
    for (const pol of selectPolicies) {
      expect(pol.qual).not.toMatch(/menu-sources|evidence/);
    }
  });
});
