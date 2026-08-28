-- Forward correction: all platform-role removal is function-owned. Preserve
-- removal capability for reviewers and contributors while direct table
-- UPDATE/DELETE is removed by the following generated RLS migration.

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
    'language_reviewer_ja',
    'language_reviewer_ko',
    'ops_agent',
    'contributor'
  ]) then
    raise exception 'invalid platform role';
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
