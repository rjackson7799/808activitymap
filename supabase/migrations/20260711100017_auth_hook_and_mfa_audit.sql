-- Migration 17: custom access-token hook + MFA-factor audit (CP2, ADR-001).
--
--  1. custom_access_token_hook — GoTrue calls this on every token issuance
--     (config.toml [auth.hook.custom_access_token] locally; dashboard/config
--     push on hosted — runbook launch-checklist item). It injects the
--     app_roles claim from user_roles; jwt_roles()/is_platform() (migration
--     3) already read exactly this shape.
--
--     SECURITY DEFINER is load-bearing: GoTrue connects as
--     supabase_auth_admin, which is neither table owner nor RLS-exempt, and
--     user_roles is RLS-enabled with zero policies — a plain function would
--     return app_roles = [] for every user (silently fail open-to-nothing).
--     Definer (owner postgres) bypasses RLS; FORCE RLS is never enabled
--     (ADR-003).
--
--     Return contract: GoTrue treats the returned `claims` as the COMPLETE
--     claims map and errors if required claims (iss/sub/role/aal/...) vanish
--     — so we jsonb_set into the full event and return it. `aal` is already
--     present; never add or drop it here.
--
--  2. MFA-factor change audit (TSD §17 security events). GoTrue writes
--     auth.mfa_factors directly, so app-layer capture would miss API-driven
--     enrollment — a trigger is the reliable path. It logs ONLY
--     (user_id, factor_type, status, friendly_name): a row snapshot would
--     copy TOTP shared secrets into audit_log, which staff can read (CP2
--     grants) — an MFA bypass. The trigger never raises (GoTrue's factor
--     transaction must not 500), and installation degrades gracefully where
--     the auth schema denies DDL (hosted risk — fallback per ADR-001:
--     app-layer audit around our enroll/verify actions).

-- ── 1. Access-token hook ─────────────────────────────────────────────────

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
security definer
set search_path = public
language plpgsql
stable
as $$
declare
  v_roles jsonb;
begin
  select coalesce(jsonb_agg(ur.role order by ur.role), '[]'::jsonb)
  into v_roles
  from public.user_roles ur
  where ur.user_id = (event->>'user_id')::uuid;

  -- jsonb_set cannot create a missing parent: ensure claims exists
  if event->'claims' is null then
    event := jsonb_set(event, '{claims}', '{}'::jsonb);
  end if;

  return jsonb_set(event, '{claims,app_roles}', v_roles);
end;
$$;

-- GoTrue-only surface
grant usage on schema public to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

-- ── 2. MFA-factor audit ──────────────────────────────────────────────────

create or replace function public.audit_mfa_factor_change()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
declare
  v_minimal_old jsonb;
  v_minimal_new jsonb;
  v_actor uuid;
  v_target text;
begin
  -- plpgsql: OLD is unassigned in INSERT triggers (and NEW in DELETE) —
  -- branch on TG_OP, never touch the unassigned record.
  begin
    if tg_op in ('UPDATE', 'DELETE') then
      v_minimal_old := jsonb_build_object(
        'user_id', old.user_id,
        'factor_type', old.factor_type,
        'status', old.status,
        'friendly_name', old.friendly_name
      );
      v_actor := old.user_id;
      v_target := old.id::text;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      v_minimal_new := jsonb_build_object(
        'user_id', new.user_id,
        'factor_type', new.factor_type,
        'status', new.status,
        'friendly_name', new.friendly_name
      );
      v_actor := new.user_id;
      v_target := new.id::text;
    end if;

    insert into public.audit_log
      (actor, actor_source, action, target_table, target_id, before, after)
    values (
      v_actor,
      'system',
      'mfa_factor_' || lower(tg_op),
      'auth.mfa_factors',
      v_target,
      v_minimal_old,
      v_minimal_new
    );
  exception when others then
    -- Never block GoTrue's factor management; losing one audit row beats
    -- breaking MFA enrollment.
    null;
  end;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
begin
  execute 'drop trigger if exists audit_mfa_factors on auth.mfa_factors';
  execute 'create trigger audit_mfa_factors
             after insert or update or delete on auth.mfa_factors
             for each row execute function public.audit_mfa_factor_change()';
exception when insufficient_privilege or undefined_table then
  -- Hosted Supabase may deny DDL in the auth schema. Degrade gracefully;
  -- fallback is app-layer audit in the enroll/verify actions (ADR-001).
  raise notice 'audit_mfa_factors trigger not installed: %', sqlerrm;
end $$;
