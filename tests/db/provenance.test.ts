import { describe, expect, it } from "vitest";
import { withRollback, expectErrorIn } from "./helpers";
import { LISTING, LOC } from "./fixtures";

/**
 * Provenance semantics (migration 12): single current row, permanent history,
 * allowlists, and the P0-10 rule that `import` is not a legal source.
 */

describe("current/history semantics", () => {
  it("upsert supersedes: one current row, full history preserved", async () => {
    await withRollback(async (tx) => {
      const before = await tx`
        select count(*)::integer as count from provenance
        where target_table = 'locations' and target_id = ${LOC.ramen} and field = 'phone'`;
      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'phone', 'vendor', 'callback')`;
      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'phone', 'editor', 'in_person_visit')`;
      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'phone', 'vendor', 'callback')`;

      const all = await tx`
        select supplied_by, is_current from provenance
        where target_table = 'locations' and target_id = ${LOC.ramen} and field = 'phone'
        order by created_at`;
      expect(all).toHaveLength(before[0]!.count + 3);
      expect(all.filter((r) => r.is_current)).toHaveLength(1);
      expect(all.at(-1)!.is_current).toBe(true);
    });
  });

  it("a second current row for the same target/field is impossible (partial unique index)", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /provenance_current_key/, (sp) =>
        sp`insert into provenance (target_table, target_id, field, supplied_by, is_current)
           values ('locations', ${LOC.ramen}, 'address', 'editor', true)`,
      );
    });
  });

  it("history rows are never deleted", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /never deleted/, (sp) =>
        sp`delete from provenance where target_table = 'locations' and target_id = ${LOC.ramen} and field = 'address'`,
      );
    });
  });

  it("rows are immutable except the supersede flip", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /immutable/, (sp) =>
        sp`update provenance set verified_at = now()
           where target_table = 'locations' and target_id = ${LOC.ramen} and field = 'address' and is_current`,
      );
      await expectErrorIn(tx, /immutable/, (sp) =>
        sp`update provenance set is_current = false, supplied_by = 'editor'
           where target_table = 'locations' and target_id = ${LOC.ramen} and field = 'address' and is_current`,
      );
      // the one legal update: the pure flip
      await tx`update provenance set is_current = false
               where target_table = 'locations' and target_id = ${LOC.ramen} and field = 'address' and is_current`;
    });
  });

  it("un-superseding (false → true) is not allowed", async () => {
    await withRollback(async (tx) => {
      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'phone', 'vendor')`;
      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'phone', 'editor')`;
      await expectErrorIn(tx, /immutable/, (sp) =>
        sp`update provenance set is_current = true
           where target_table = 'locations' and target_id = ${LOC.ramen} and field = 'phone' and not is_current`,
      );
    });
  });
});

describe("allowlists", () => {
  it("rejects a field not allowlisted for the target table", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /not allowlisted/, (sp) =>
        sp`select upsert_provenance('listings', ${LISTING.ramen}::uuid, 'secret_field', 'vendor')`,
      );
    });
  });

  it("rejects a target table outside the allowlist", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /not allowlisted/, (sp) =>
        sp`select upsert_provenance('audit_log', ${LISTING.ramen}::uuid, 'name', 'vendor')`,
      );
    });
  });

  it("table CHECK also rejects direct inserts with a bad target_table", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /provenance_target_table_check/, (sp) =>
        sp`insert into provenance (target_table, target_id, field, supplied_by)
           values ('users', ${LISTING.ramen}, 'name', 'vendor')`,
      );
    });
  });

  it("`import` is not a legal supplied_by (P0-10 — use migration_first_party)", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /provenance_supplied_by_check/, (sp) =>
        sp`insert into provenance (target_table, target_id, field, supplied_by)
           values ('listings', ${LISTING.ramen}, 'name', 'import')`,
      );
      // the sanctioned first-party-migration value works
      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'geo', 'migration_first_party', 'first_party_migration')`;
    });
  });
});
