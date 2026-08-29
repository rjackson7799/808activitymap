import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { expectErrorIn, sql, withRollback } from "./helpers";

/**
 * Custom access-token hook + MFA-factor audit (migration 17, ADR-001).
 *
 * GoTrue invokes the hook over its own connection as supabase_auth_admin —
 * NOT as superuser — so these tests invoke it over a real
 * supabase_auth_admin connection. The hook is SECURITY DEFINER precisely because
 * user_roles is RLS-enabled with zero policies: a plain function would
 * silently return app_roles=[] for every user (fail-open-to-nothing).
 *
 * Return contract: GoTrue treats the returned object's `claims` as the
 * COMPLETE claims map — original claims must survive, only app_roles added.
 */

/** Rollback-based tests (audit) use this id — nothing for it is ever committed. */
const USER = "88000000-0000-4000-8000-000000000001";
/**
 * The hook tests need a SECOND connection (as supabase_auth_admin, GoTrue's
 * actual role — local `postgres` is not superuser and supabase_auth_admin
 * memberships are reserved, so SET ROLE is impossible). A second connection
 * cannot see uncommitted rows, so these fixtures are COMMITTED and cleaned
 * up afterwards — under a distinct id, because their audit_log residue is
 * append-only and must not pollute the exact-match audit tests on USER.
 */
const HOOK_USER = "88000000-0000-4000-8000-000000000002";

const authAdminSql = postgres(
  (() => {
    const u = new URL(
      process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:54332/postgres",
    );
    u.username = "supabase_auth_admin";
    return u.toString();
  })(),
  { max: 1, onnotice: () => {} },
);

const seedAuthUserSql = (user: string) => `
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', '${user}', 'authenticated',
       'authenticated', 'hook-test-${user.slice(-2)}@example.invalid', '',
       now(), now(), now())
    on conflict (id) do nothing`;

const seedAuthUser = async (tx: { unsafe: (q: string) => Promise<unknown> }) => {
  // Minimal GoTrue-compatible row; coupled to the auth schema's column set.
  await tx.unsafe(seedAuthUserSql(USER));
};

const cleanupHookUser = async () => {
  await sql`delete from user_roles where user_id = ${HOOK_USER}`;
  await sql.unsafe(`delete from auth.users where id = '${HOOK_USER}'`);
};

afterAll(async () => {
  await cleanupHookUser();
  await authAdminSql.end();
});

// GoTrue's real event shape (abridged): user_id + full claims map.
const eventFor = (user: string) => ({
  user_id: user,
  authentication_method: "password",
  claims: {
    iss: "supabase",
    sub: user,
    aud: "authenticated",
    role: "authenticated",
    aal: "aal1",
    session_id: "00000000-0000-0000-0000-0000000000aa",
    email: "hook-test@example.invalid",
    is_anonymous: false,
  },
});

describe("custom_access_token_hook (invoked as supabase_auth_admin, GoTrue's role)", () => {
  const event = eventFor(HOOK_USER);

  it("injects app_roles from user_roles and preserves every original claim", async () => {
    await sql.unsafe(seedAuthUserSql(HOOK_USER));
    await sql`insert into user_roles (user_id, role) values (${HOOK_USER}, 'publisher'), (${HOOK_USER}, 'editor') on conflict do nothing`;

    const rows = await authAdminSql`select public.custom_access_token_hook(${authAdminSql.json(event)}) as out`;
    const out = rows[0]!.out as ReturnType<typeof eventFor> & { claims: { app_roles?: string[] } };

    expect(out.claims.app_roles).toEqual(["editor", "publisher"]);
    // original claims survive — GoTrue errors if required claims vanish
    expect(out.claims.sub).toBe(HOOK_USER);
    expect(out.claims.aal).toBe("aal1");
    expect(out.claims.role).toBe("authenticated");
    expect(out.claims.session_id).toBe(event.claims.session_id);
    expect(out.user_id).toBe(HOOK_USER);
  });

  it("returns app_roles=[] for a user with no rows (fail-closed, not missing)", async () => {
    await sql.unsafe(seedAuthUserSql(HOOK_USER));
    await sql`delete from user_roles where user_id = ${HOOK_USER}`;

    const rows = await authAdminSql`select public.custom_access_token_hook(${authAdminSql.json(event)}) as out`;
    const out = rows[0]!.out as { claims: { app_roles?: unknown } };
    expect(out.claims.app_roles).toEqual([]);
  });

  it("cannot be executed by anon or authenticated (GoTrue-only surface)", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      await expectErrorIn(tx, /permission denied for function/, (sp) =>
        sp`select custom_access_token_hook(${tx.json(eventFor(USER))})`,
      );
      await tx.unsafe("reset role");
      await tx.unsafe("set local role authenticated");
      await expectErrorIn(tx, /permission denied for function/, (sp) =>
        sp`select custom_access_token_hook(${tx.json(eventFor(USER))})`,
      );
    });
  });
});

describe("security-event audit (TSD §17)", () => {
  it("role grants and revocations write audit rows (migration 4 trigger — regression pin)", async () => {
    await withRollback(async (tx) => {
      await seedAuthUser(tx);
      await tx`insert into user_roles (user_id, role) values (${USER}, 'ops_agent')`;
      await tx`delete from user_roles where user_id = ${USER} and role = 'ops_agent'`;
      const rows = await tx`
        select action, (case when action = 'INSERT' then after else before end)->>'role' as role
        from audit_log
        where target_table = 'user_roles'
          and coalesce(after->>'user_id', before->>'user_id') = ${USER}
        order by at, id`;
      expect(rows.map((r) => [r.action, r.role])).toEqual([
        ["INSERT", "ops_agent"],
        ["DELETE", "ops_agent"],
      ]);
    });
  });

  it("MFA factor changes are audited with minimal fields — never the secret", async () => {
    await withRollback(async (tx) => {
      await seedAuthUser(tx);
      await tx.unsafe(`
        insert into auth.mfa_factors
          (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
        values
          (gen_random_uuid(), '${USER}', 'test-authenticator', 'totp',
           'unverified', 'TOTP_SHARED_SECRET_MUST_NOT_LEAK', now(), now())`);

      const rows = await tx`
        select actor, actor_source, action, before, after
        from audit_log
        where action = 'mfa_factor_insert' and (after->>'user_id') = ${USER}`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.actor).toBe(USER);
      expect(rows[0]!.actor_source).toBe("system");
      expect(rows[0]!.after).toMatchObject({ factor_type: "totp", status: "unverified" });

      // the whole audit surface for this event must be free of secret material
      const leak = await tx`
        select 1 from audit_log
        where action like 'mfa_factor_%'
          and (coalesce(before::text, '') || coalesce(after::text, '')) like '%TOTP_SHARED_SECRET%'`;
      expect(leak).toEqual([]);
    });
  });

  it("factor verification (status flip) and unenrollment are audited too", async () => {
    await withRollback(async (tx) => {
      await seedAuthUser(tx);
      await tx.unsafe(`
        insert into auth.mfa_factors
          (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
        values
          ('87000000-0000-4000-8000-000000000001', '${USER}', 'test-authenticator',
           'totp', 'unverified', 's3cret', now(), now())`);
      await tx.unsafe(`update auth.mfa_factors set status = 'verified' where id = '87000000-0000-4000-8000-000000000001'`);
      await tx.unsafe(`delete from auth.mfa_factors where id = '87000000-0000-4000-8000-000000000001'`);

      const rows = await tx`
        select action from audit_log
        where action like 'mfa_factor_%'
          and coalesce(after->>'user_id', before->>'user_id') = ${USER}
        order by at`;
      expect(rows.map((r) => r.action)).toEqual([
        "mfa_factor_insert",
        "mfa_factor_update",
        "mfa_factor_delete",
      ]);
    });
  });

  it("verifies a canonical factor audit without creating a duplicate", async () => {
    await withRollback(async (tx) => {
      await seedAuthUser(tx);
      const factor = "87000000-0000-4000-8000-000000000011";
      await tx`
        insert into auth.mfa_factors
          (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
        values
          (${factor}::uuid, ${USER}::uuid, 'primary', 'totp', 'unverified',
           'SECRET_NOT_AUDITED', now(), now())`;

      const [result] = await tx`
        select public.ensure_mfa_factor_audit(
          ${USER}::uuid, ${factor}::uuid, 'insert', 'totp', 'primary',
          null, 'unverified'
        ) as outcome`;
      expect(result!.outcome).toBe("trigger_recorded");
      const rows = await tx`
        select actor_source, before, after
        from audit_log
        where target_table = 'auth.mfa_factors'
          and target_id = ${factor}
          and action = 'mfa_factor_insert'`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actor_source: "system", before: null });
      expect(JSON.stringify(rows[0])).not.toContain("SECRET_NOT_AUDITED");
    });
  });

  it("writes one minimal fallback when the exact trigger event is absent", async () => {
    await withRollback(async (tx) => {
      await seedAuthUser(tx);
      const factor = "87000000-0000-4000-8000-000000000012";
      // A verified-at-insert fixture has no canonical UPDATE row, modeling a
      // swallowed trigger audit after a successful unverified -> verified mutation.
      await tx`
        insert into auth.mfa_factors
          (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
        values
          (${factor}::uuid, ${USER}::uuid, 'fallback', 'totp', 'verified',
           'ANOTHER_SECRET_NOT_AUDITED', now(), now())`;

      const [result] = await tx`
        select public.ensure_mfa_factor_audit(
          ${USER}::uuid, ${factor}::uuid, 'update', 'totp', 'fallback',
          'unverified', 'verified'
        ) as outcome`;
      expect(result!.outcome).toBe("fallback_recorded");
      const rows = await tx`
        select actor, actor_source, before, after
        from audit_log
        where target_table = 'auth.mfa_factors'
          and target_id = ${factor}
          and action = 'mfa_factor_update'`;
      expect(rows).toEqual([
        expect.objectContaining({
          actor: USER,
          actor_source: "service",
          before: expect.objectContaining({ status: "unverified", factor_type: "totp" }),
          after: expect.objectContaining({ status: "verified", factor_type: "totp" }),
        }),
      ]);
      expect(JSON.stringify(rows)).not.toContain("ANOTHER_SECRET_NOT_AUDITED");
    });
  });

  it("keeps the fallback RPC service-only and rejects impossible transitions", async () => {
    const signature =
      "public.ensure_mfa_factor_audit(uuid,uuid,text,text,text,text,text)";
    const [privileges] = await sql`
      select
        has_function_privilege('anon', ${signature}, 'execute') as anon,
        has_function_privilege('authenticated', ${signature}, 'execute') as authenticated,
        has_function_privilege('service_role', ${signature}, 'execute') as service`;
    expect(privileges).toEqual({ anon: false, authenticated: false, service: true });

    await expect(
      sql`select public.ensure_mfa_factor_audit(
        ${USER}::uuid,
        '87000000-0000-4000-8000-000000000013'::uuid,
        'update', 'totp', null, 'verified', 'unverified'
      )`,
    ).rejects.toThrow(/invalid update transition/);
  });
});
