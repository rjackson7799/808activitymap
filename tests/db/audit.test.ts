import { describe, expect, it } from "vitest";
import { expectErrorIn, sql, withClaimsSuper, withRollback } from "./helpers";
import { ACTOR, MEDIA, ORG } from "./fixtures";

/**
 * Audit-log guarantees (migration 4): same-transaction coupling, append-only,
 * actor resolution (jwt → service → system), request-id correlation, and
 * evidence-payload exclusion.
 */

describe("audit coupling and coverage", () => {
  it("a content mutation and its audit row commit or roll back together", async () => {
    const before = await sql`select count(*)::int as c from audit_log`;
    await withRollback(async (tx) => {
      await tx`update organizations set notes = 'audited?' where id = ${ORG.ramen}`;
      const inside = await tx`select count(*)::int as c from audit_log`;
      expect(inside[0]!.c).toBe(before[0]!.c + 1);
    });
    const after = await sql`select count(*)::int as c from audit_log`;
    expect(after[0]!.c).toBe(before[0]!.c); // rolled back together
  });

  it("every mutable content table carries the audit trigger", async () => {
    const missing = await sql`
      select t.tablename
      from pg_tables t
      where t.schemaname = 'public'
        and t.tablename not in ('audit_log', 'events')      -- append-only log + telemetry
        and t.tablename not like 'events_%'                 -- partitions
        and not exists (
          select 1 from pg_trigger tr
          join pg_class c on c.oid = tr.tgrelid
          join pg_proc p on p.oid = tr.tgfoid
          where c.relname = t.tablename and p.proname = 'write_audit'
        )`;
    expect(missing).toEqual([]);
  });
});

describe("actor resolution", () => {
  it("JWT subject wins when claims are present", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      await tx`update organizations set notes = 'jwt actor' where id = ${ORG.ramen}`;
      const row = await tx`select actor, actor_source from audit_log order by id desc limit 1`;
      expect(row[0]).toEqual({ actor: ACTOR.publisher, actor_source: "jwt" });
    });
  });

  it("service operations attribute via the app.actor GUC", async () => {
    await withRollback(async (tx) => {
      await tx`select set_config('app.actor', ${ACTOR.admin}, true)`;
      await tx`update organizations set notes = 'service actor' where id = ${ORG.ramen}`;
      const row = await tx`select actor, actor_source from audit_log order by id desc limit 1`;
      expect(row[0]).toEqual({ actor: ACTOR.admin, actor_source: "service" });
    });
  });

  it("no attribution at all records as system", async () => {
    await withRollback(async (tx) => {
      await tx`update organizations set notes = 'system actor' where id = ${ORG.ramen}`;
      const row = await tx`select actor, actor_source from audit_log order by id desc limit 1`;
      expect(row[0]).toEqual({ actor: null, actor_source: "system" });
    });
  });

  it("request/correlation id rides along from app.request_id", async () => {
    await withRollback(async (tx) => {
      await tx`select set_config('app.request_id', 'req-fixture-42', true)`;
      await tx`update organizations set notes = 'correlated' where id = ${ORG.ramen}`;
      const row = await tx`select request_id from audit_log order by id desc limit 1`;
      expect(row[0]!.request_id).toBe("req-fixture-42");
    });
  });
});

describe("append-only", () => {
  it("updates to audit rows raise", async () => {
    await withRollback(async (tx) => {
      await tx`update organizations set notes = 'target row' where id = ${ORG.ramen}`;
      await expectErrorIn(tx, /append-only/, (sp) =>
        sp`update audit_log set action = 'TAMPERED' where id = (select max(id) from audit_log)`,
      );
    });
  });

  it("deletes of audit rows raise", async () => {
    await withRollback(async (tx) => {
      await tx`update organizations set notes = 'target row' where id = ${ORG.ramen}`;
      await expectErrorIn(tx, /append-only/, (sp) =>
        sp`delete from audit_log where id = (select max(id) from audit_log)`,
      );
    });
  });

  it("audit_log: authenticated may only SELECT (PRD §4 read row) — writes have no grant", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role authenticated");
      // CP2: select is granted (RLS scopes rows per §4 — full read for
      // publisher+, own-scope for others; see rls suites). A role-less JWT
      // sees nothing.
      const rows = await tx`select * from audit_log`;
      expect(rows).toEqual([]);
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`insert into audit_log (actor_source, action, target_table) values ('jwt', 'X', 'y')`,
      );
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`update audit_log set action = 'X'`,
      );
      await expectErrorIn(tx, /permission denied/, (sp) => sp`delete from audit_log`);
    });
  });
});

describe("evidence-payload exclusion", () => {
  it("media.rights never appears in audit snapshots (before or after)", async () => {
    await withRollback(async (tx) => {
      await tx`update media set rights = '{"license":"secret_v2","granted_by":"Someone"}'::jsonb
               where id = ${MEDIA.ramenPhoto1}`;
      const row = await tx`select before, after from audit_log order by id desc limit 1`;
      expect(row[0]!.before).not.toHaveProperty("rights");
      expect(row[0]!.after).not.toHaveProperty("rights");
      // the row itself still records the mutation
      expect((row[0]!.after as Record<string, unknown>).id).toBe(MEDIA.ramenPhoto1);
    });
  });
});
