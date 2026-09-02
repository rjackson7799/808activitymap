import { describe, expect, it } from "vitest";
import { setClaims, withClaims, withRollback } from "./helpers";
import { ACTOR } from "./fixtures";

describe("Phase 0 admin configuration registry", () => {
  it("is readable by staff roles and hidden from role-less authenticated users", async () => {
    for (const role of ["super_admin", "publisher", "editor", "language_reviewer_ja", "ops_agent"]) {
      await withClaims({ sub: ACTOR.admin, app_roles: [role], aal: "aal2" }, async (tx) => {
        const [row] = await tx`select count(*)::int as count from app_config`;
        expect(row!.count, role).toBeGreaterThan(0);
      });
    }

    await withClaims({ sub: ACTOR.admin, app_roles: [], aal: "aal2" }, async (tx) => {
      const [row] = await tx`select count(*)::int as count from app_config`;
      expect(row!.count).toBe(0);
    });
  });

  it("allows only super_admin at aal2 to update and audit-attributes the mutation", async () => {
    await withRollback(async (tx) => {
      await setClaims(tx, { sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, true);
      const editor = await tx`update app_config set value = '4'::jsonb where key = 'report_delivery_day'`;
      expect(editor.count).toBe(0);

      await setClaims(tx, { sub: ACTOR.admin, app_roles: ["super_admin"], aal: "aal1" }, true);
      const noMfa = await tx`update app_config set value = '4'::jsonb where key = 'report_delivery_day'`;
      expect(noMfa.count).toBe(0);

      await setClaims(tx, { sub: ACTOR.admin, app_roles: ["super_admin"], aal: "aal2" }, true);
      const changed = await tx`
        update app_config
        set value = '4'::jsonb, updated_by = ${ACTOR.admin}
        where key = 'report_delivery_day'`;
      expect(changed.count).toBe(1);

      const [audit] = await tx`
        select actor, actor_source, action, before->'value' as before_value, after->'value' as after_value
        from audit_log
        where target_table = 'app_config' and after->>'key' = 'report_delivery_day'
        order by at desc, id desc
        limit 1`;
      expect(audit).toEqual({
        actor: ACTOR.admin,
        actor_source: "jwt",
        action: "UPDATE",
        before_value: 3,
        after_value: 4,
      });
    });
  });
});
