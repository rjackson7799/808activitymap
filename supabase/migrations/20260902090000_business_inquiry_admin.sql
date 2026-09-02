-- Phase 0 staff readback for the public business-interest form.
-- This remains an inquiry workflow only: it cannot create a claim, account,
-- organization membership, subscription, or publication right.

alter table public.business_inquiries
  add column handled_by uuid,
  add column handled_at timestamptz,
  add column staff_note text
    constraint business_inquiries_staff_note_length check (
      staff_note is null or char_length(staff_note) between 3 and 2000
    ),
  add constraint business_inquiries_handling_consistency check (
    status = 'open'
    or (
      handled_by is not null
      and handled_at is not null
      and staff_note is not null
    )
  );

create index business_inquiries_handled_by_idx
  on public.business_inquiries (handled_by, status, updated_at desc);

-- Keep the operational state in the immutable audit trail without copying
-- contact details or the inquiry message into a second retained surface.
drop trigger audit_business_inquiries on public.business_inquiries;
create trigger audit_business_inquiries
  after insert or update or delete on public.business_inquiries
  for each row execute function public.write_audit(
    'business_name', 'contact_name', 'email', 'phone', 'website', 'message'
  );

create or replace function public.list_business_inquiries()
returns setof public.business_inquiries
security definer
set search_path = public
language plpgsql
stable
as $$
begin
  if not public.is_platform(array['super_admin', 'editor', 'ops_agent']) then
    raise exception 'permission_denied: inquiry readback requires operations staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: inquiry readback requires recent MFA';
  end if;

  return query
    select *
    from public.business_inquiries
    order by
      case status when 'open' then 0 when 'contacted' then 1 else 2 end,
      created_at asc;
end;
$$;

create or replace function public.transition_business_inquiry(
  p_id uuid,
  p_status text,
  p_staff_note text
)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_current_status text;
begin
  if not public.is_platform(array['super_admin', 'editor', 'ops_agent']) then
    raise exception 'permission_denied: inquiry handling requires operations staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: inquiry handling requires recent MFA';
  end if;
  if p_status not in ('open', 'contacted', 'closed') then
    raise exception 'invalid_business_inquiry_status';
  end if;
  if char_length(trim(coalesce(p_staff_note, ''))) not between 3 and 2000 then
    raise exception 'invalid_business_inquiry_staff_note';
  end if;

  select status into v_current_status
  from public.business_inquiries
  where id = p_id
  for update;

  if not found then raise exception 'business_inquiry_not_found'; end if;
  if v_current_status = p_status then raise exception 'business_inquiry_status_unchanged'; end if;

  update public.business_inquiries
  set
    status = p_status,
    handled_by = auth.uid(),
    handled_at = now(),
    staff_note = trim(p_staff_note)
  where id = p_id;
end;
$$;

revoke all on function public.list_business_inquiries() from public, anon, service_role;
revoke all on function public.transition_business_inquiry(uuid, text, text) from public, anon, service_role;
grant execute on function public.list_business_inquiries() to authenticated;
grant execute on function public.transition_business_inquiry(uuid, text, text) to authenticated;

comment on function public.list_business_inquiries() is
  'MFA-gated Phase 0 inquiry readback for super_admin, editor, and ops_agent.';
comment on function public.transition_business_inquiry(uuid, text, text) is
  'Audited inquiry status transition; never creates a claim or vendor account.';
