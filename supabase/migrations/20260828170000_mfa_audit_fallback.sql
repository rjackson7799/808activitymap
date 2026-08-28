-- Phase 0 hardening: verify each application-managed MFA factor mutation
-- reached the canonical trigger audit, and write one sanitized fallback row
-- when it did not. Audit failure remains non-fatal to MFA availability.

create or replace function public.ensure_mfa_factor_audit(
  p_actor uuid,
  p_factor_id uuid,
  p_operation text,
  p_factor_type text,
  p_friendly_name text,
  p_before_status text,
  p_after_status text
)
returns text
security definer
set search_path = public
language plpgsql
volatile
as $$
declare
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  if p_actor is null or p_factor_id is null then
    raise exception 'actor and factor are required';
  end if;
  if p_factor_type <> 'totp' then
    raise exception 'invalid factor type';
  end if;

  case p_operation
    when 'insert' then
      if p_before_status is not null or p_after_status <> 'unverified' then
        raise exception 'invalid insert transition';
      end if;
    when 'update' then
      if p_before_status <> 'unverified' or p_after_status <> 'verified' then
        raise exception 'invalid update transition';
      end if;
    when 'delete' then
      if p_before_status not in ('unverified', 'verified') or p_after_status is not null then
        raise exception 'invalid delete transition';
      end if;
    else
      raise exception 'invalid MFA audit operation';
  end case;

  v_action := 'mfa_factor_' || p_operation;
  if p_before_status is not null then
    v_before := jsonb_build_object(
      'user_id', p_actor,
      'factor_type', p_factor_type,
      'status', p_before_status,
      'friendly_name', p_friendly_name
    );
  end if;
  if p_after_status is not null then
    v_after := jsonb_build_object(
      'user_id', p_actor,
      'factor_type', p_factor_type,
      'status', p_after_status,
      'friendly_name', p_friendly_name
    );
  end if;

  begin
    if exists (
      select 1
      from public.audit_log a
      where a.actor = p_actor
        and a.action = v_action
        and a.target_table = 'auth.mfa_factors'
        and a.target_id = p_factor_id::text
        and (p_before_status is null or a.before->>'status' = p_before_status)
        and (p_after_status is null or a.after->>'status' = p_after_status)
    ) then
      return 'trigger_recorded';
    end if;

    insert into public.audit_log (
      actor,
      actor_source,
      action,
      target_table,
      target_id,
      before,
      after
    ) values (
      p_actor,
      'service',
      v_action,
      'auth.mfa_factors',
      p_factor_id::text,
      v_before,
      v_after
    );
    return 'fallback_recorded';
  exception when others then
    raise warning 'MFA audit verification/fallback failed';
    return 'failed';
  end;
end;
$$;

revoke execute on function public.ensure_mfa_factor_audit(
  uuid, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.ensure_mfa_factor_audit(
  uuid, uuid, text, text, text, text, text
) to service_role;
