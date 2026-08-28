import { describe, expect, it } from "vitest";
import { expectErrorIn, withRollback, type TxSql } from "./helpers";

const ADMIN = "88000000-0000-4000-8000-000000000001";
const TARGET = "88000000-0000-4000-8000-000000000002";
const ADMIN_SESSION = "88000000-0000-4000-8000-000000000011";
const TARGET_SESSION_1 = "88000000-0000-4000-8000-000000000012";
const TARGET_SESSION_2 = "88000000-0000-4000-8000-000000000013";
const PROBE_ORG = "88000000-0000-4000-8000-000000000021";

const setClaims = async (
  tx: TxSql,
  sub: string,
  sessionId: string,
  roles: string[],
  aal: "aal1" | "aal2",
) => {
  await tx`select set_config(
    'request.jwt.claims',
    ${JSON.stringify({
      role: "authenticated",
      sub,
      session_id: sessionId,
      app_roles: roles,
      aal,
    })},
    true
  )`;
};

async function seed(tx: TxSql): Promise<void> {
  await tx`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at
    ) values
      ('00000000-0000-0000-0000-000000000000', ${ADMIN}::uuid,
       'authenticated', 'authenticated', 'revoke-admin@example.invalid', '',
       now(), now(), now()),
      ('00000000-0000-0000-0000-000000000000', ${TARGET}::uuid,
       'authenticated', 'authenticated', 'revoke-target@example.invalid', '',
       now(), now(), now());
  `;
  await tx`
    insert into public.user_roles (user_id, role) values
      (${ADMIN}::uuid, 'super_admin'),
      (${TARGET}::uuid, 'publisher'),
      (${TARGET}::uuid, 'editor')`;
  await tx`
    insert into auth.sessions (id, user_id) values
      (${ADMIN_SESSION}::uuid, ${ADMIN}::uuid),
      (${TARGET_SESSION_1}::uuid, ${TARGET}::uuid),
      (${TARGET_SESSION_2}::uuid, ${TARGET}::uuid)`;
  await tx`
    insert into public.organizations (id, name)
    values (${PROBE_ORG}::uuid, 'Revocation probe')`;
}

describe("atomic operator revocation", () => {
  it("removes the role, all sessions, records both audit layers, and invalidates a captured token", async () => {
    await withRollback(async (tx) => {
      await seed(tx);

      const [auditStart] = await tx`select coalesce(max(id), 0)::bigint as id from audit_log`;

      await setClaims(tx, TARGET, TARGET_SESSION_1, ["publisher", "editor"], "aal2");
      const [before] = await tx`select public.is_platform(array['publisher']) as allowed`;
      expect(before!.allowed).toBe(true);

      await setClaims(tx, ADMIN, ADMIN_SESSION, ["super_admin"], "aal2");
      const [revoked] = await tx`
        select public.revoke_platform_role(
          ${TARGET}::uuid,
          'publisher',
          'incident response'
        ) as sessions`;
      expect(revoked!.sessions).toBe(2);

      const roles = await tx`
        select role from public.user_roles
        where user_id = ${TARGET}::uuid
        order by role`;
      expect(roles.map((row) => row.role)).toEqual(["editor"]);

      const sessions = await tx`
        select id from auth.sessions where user_id = ${TARGET}::uuid`;
      expect(sessions).toEqual([]);

      const [audit] = await tx`
        select actor, action, target_id, after
        from public.audit_log
        where action = 'operator_role_revoked'
          and target_id = ${`${TARGET}:publisher`}
        order by at desc
        limit 1`;
      expect(audit).toMatchObject({
        actor: ADMIN,
        action: "operator_role_revoked",
        target_id: `${TARGET}:publisher`,
      });
      expect(audit!.after).toMatchObject({
        active: false,
        sessions_revoked: 2,
        reason: "incident response",
      });
      const auditActions = await tx`
        select action
        from public.audit_log
        where id > ${auditStart!.id}
          and target_table = 'user_roles'
        order by id`;
      expect(auditActions.map((row) => row.action)).toEqual([
        "DELETE",
        "operator_role_revoked",
      ]);

      await setClaims(tx, TARGET, TARGET_SESSION_1, ["publisher", "editor"], "aal2");
      const [after] = await tx`
        select public.is_platform(array['publisher', 'editor']) as allowed`;
      expect(after!.allowed).toBe(false);

      const [hook] = await tx`
        select public.custom_access_token_hook(
          jsonb_build_object(
            'user_id', ${TARGET}::text,
            'claims', jsonb_build_object('sub', ${TARGET}::text)
          )
        ) as result`;
      expect(hook!.result.claims.app_roles).toEqual(["editor"]);

      await tx.unsafe("set local role authenticated");
      const privilegedWrite = await tx`
        update public.organizations
        set notes = 'captured token write'
        where id = ${PROBE_ORG}::uuid
        returning id`;
      expect(privilegedWrite).toEqual([]);
    });
  });

  it("blocks direct role removal/replacement while preserving direct grants", async () => {
    await withRollback(async (tx) => {
      await seed(tx);
      await setClaims(tx, ADMIN, ADMIN_SESSION, ["super_admin"], "aal2");
      await tx.unsafe("set local role authenticated");

      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`delete from public.user_roles
           where user_id = ${TARGET}::uuid and role = 'publisher'`,
      );
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`update public.user_roles
           set role = 'ops_agent'
           where user_id = ${TARGET}::uuid and role = 'publisher'`,
      );
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`insert into public.user_roles (user_id, role)
           values (${TARGET}::uuid, 'publisher')
           on conflict (user_id, role) do update set granted_by = ${ADMIN}::uuid`,
      );

      await tx`insert into public.user_roles (user_id, role)
        values (${TARGET}::uuid, 'ops_agent')`;
      await tx.unsafe("reset role");
      const [state] = await tx`
        select
          array_agg(role order by role) as roles,
          (select count(*)::integer from auth.sessions where user_id = ${TARGET}::uuid) as sessions
        from public.user_roles
        where user_id = ${TARGET}::uuid`;
      expect(state).toMatchObject({
        roles: ["editor", "ops_agent", "publisher"],
        sessions: 2,
      });
    });
  });

  it("requires a live super-admin session at aal2 and leaves state unchanged on denial", async () => {
    await withRollback(async (tx) => {
      await seed(tx);

      await setClaims(tx, TARGET, TARGET_SESSION_1, ["publisher", "editor"], "aal2");
      await expectErrorIn(tx, /permission denied/, (sp) =>
        sp`select public.revoke_platform_role(
          ${TARGET}::uuid, 'publisher', 'unauthorized attempt'
        )`,
      );

      await setClaims(tx, ADMIN, ADMIN_SESSION, ["super_admin"], "aal1");
      await expectErrorIn(tx, /aal2 required/, (sp) =>
        sp`select public.revoke_platform_role(
          ${TARGET}::uuid, 'publisher', 'no mfa'
        )`,
      );

      const [state] = await tx`
        select
          exists(
            select 1 from public.user_roles
            where user_id = ${TARGET}::uuid and role = 'publisher'
          ) as has_role,
          (select count(*)::integer from auth.sessions where user_id = ${TARGET}::uuid) as sessions`;
      expect(state).toMatchObject({ has_role: true, sessions: 2 });
    });
  });
});
