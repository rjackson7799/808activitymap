-- Phase 0 hardening: make privileged authorization depend on live role and
-- session state, and provide an atomic, audited operator-role revocation path.

create or replace function public.is_platform(required text[])
returns boolean
security definer
set search_path = public
language sql
stable
as $$
  with identity as (
    select
      auth.uid() as user_id,
      case
        when coalesce(public.jwt_claims()->>'session_id', '') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (public.jwt_claims()->>'session_id')::uuid
        else null
      end as session_id
  )
  select exists (
    select 1
    from identity i
    join auth.sessions s
      on s.id = i.session_id
     and s.user_id = i.user_id
    join public.user_roles ur
      on ur.user_id = i.user_id
    where ur.role = any(required)
      and ur.role = any(public.jwt_roles())
  );
$$;

revoke execute on function public.is_platform(text[]) from public;
grant execute on function public.is_platform(text[]) to anon, authenticated, service_role;

create or replace function public.revoke_platform_role(
  p_target_user_id uuid,
  p_role text,
  p_reason text
)
returns integer
security definer
set search_path = public
language plpgsql
volatile
as $$
declare
  v_session_count integer;
begin
  if not public.is_platform(array['super_admin']) then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2 required' using errcode = '42501';
  end if;

  if p_role is null or p_role <> all(array[
    'super_admin',
    'publisher',
    'editor',
    'ops_agent'
  ]) then
    raise exception 'invalid privileged role';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'revocation reason required';
  end if;

  perform 1
  from auth.users
  where id = p_target_user_id
  for update;

  if not found then
    raise exception 'target user not found';
  end if;

  delete from public.user_roles
  where user_id = p_target_user_id
    and role = p_role;

  if not found then
    raise exception 'target role not found';
  end if;

  select count(*)::integer
  into v_session_count
  from auth.sessions
  where user_id = p_target_user_id;

  delete from auth.sessions
  where user_id = p_target_user_id;

  insert into public.audit_log (
    actor,
    actor_source,
    action,
    target_table,
    target_id,
    before,
    after
  ) values (
    auth.uid(),
    'jwt',
    'operator_role_revoked',
    'user_roles',
    p_target_user_id::text || ':' || p_role,
    jsonb_build_object('active', true),
    jsonb_build_object(
      'active', false,
      'sessions_revoked', v_session_count,
      'reason', btrim(p_reason)
    )
  );

  return v_session_count;
end;
$$;

revoke execute on function public.revoke_platform_role(uuid, text, text) from public;
revoke execute on function public.revoke_platform_role(uuid, text, text) from anon;
revoke execute on function public.revoke_platform_role(uuid, text, text) from service_role;
grant execute on function public.revoke_platform_role(uuid, text, text) to authenticated;
