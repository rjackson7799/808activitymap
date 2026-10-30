-- Phase 0 assisted updates: retain vendor email/SMS requests as evidence,
-- link each request to the correction workflow, and track the one-business-day
-- response target. External inbox/provider integration remains operational.

create table public.assisted_messages (
  id uuid primary key default gen_random_uuid(),
  market_id text not null references public.markets (id),
  listing_id uuid not null references public.listings (id) on delete restrict,
  channel text not null
    constraint assisted_messages_channel_check check (channel in ('email', 'sms')),
  locale text not null
    constraint assisted_messages_locale_check check (locale in ('en', 'ja', 'ko')),
  from_address text not null
    constraint assisted_messages_from_address_length check (length(trim(from_address)) between 3 and 320),
  body text not null
    constraint assisted_messages_body_length check (length(trim(body)) between 10 and 5000),
  received_at timestamptz not null,
  response_due_at timestamptz not null,
  responded_at timestamptz,
  response_note text,
  responded_by uuid,
  linked_change_request_id uuid not null unique references public.change_requests (id) on delete restrict,
  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assisted_messages_response_consistency check (
    (responded_at is null and response_note is null and responded_by is null)
    or
    (responded_at is not null and responded_by is not null
      and length(trim(response_note)) between 3 and 2000)
  )
);

create index assisted_messages_queue_idx
  on public.assisted_messages (responded_at nulls first, response_due_at, received_at);
create index assisted_messages_listing_idx
  on public.assisted_messages (listing_id, received_at desc);

alter table public.assisted_messages enable row level security;
revoke all on table public.assisted_messages from anon, authenticated;

create trigger assisted_messages_updated_at
  before update on public.assisted_messages
  for each row execute function public.set_updated_at();

-- Contact details, message contents, and internal response notes are retained
-- in this restricted evidence table but excluded from duplicated audit JSON.
create trigger audit_assisted_messages
  after insert or update or delete on public.assisted_messages
  for each row execute function public.write_audit('from_address', 'body', 'response_note');

create or replace function public.record_assisted_update(
  p_listing_id uuid,
  p_channel text,
  p_locale text,
  p_from_address text,
  p_body text,
  p_field text,
  p_details text,
  p_received_at timestamptz
)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare
  v_listing public.listings%rowtype;
  v_change_request_id uuid;
  v_received_local timestamp;
  v_response_due_at timestamptz;
begin
  if not public.is_platform(array['ops_agent', 'editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: assisted update intake requires operations staff';
  end if;
  if public.is_platform(array['editor', 'publisher', 'super_admin'])
     and public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: privileged assisted update intake requires recent MFA';
  end if;
  if p_channel not in ('email', 'sms') then raise exception 'invalid_assisted_channel'; end if;
  if p_locale not in ('en', 'ja') then raise exception 'invalid_assisted_locale'; end if;
  if length(trim(coalesce(p_from_address, ''))) not between 3 and 320 then
    raise exception 'invalid_assisted_from_address';
  end if;
  if length(trim(coalesce(p_body, ''))) not between 10 and 5000 then
    raise exception 'invalid_assisted_body';
  end if;
  if p_field not in ('name', 'address', 'phone', 'hours', 'menu', 'closure', 'other') then
    raise exception 'invalid_change_request_field';
  end if;
  if length(trim(coalesce(p_details, ''))) not between 10 and 2000 then
    raise exception 'invalid_change_request_details';
  end if;
  if p_received_at is null or p_received_at > now() + interval '5 minutes' then
    raise exception 'invalid_assisted_received_at';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then raise exception 'listing_not_found'; end if;

  -- Preserve the received local time while advancing to the next weekday.
  v_received_local := p_received_at at time zone 'Pacific/Honolulu';
  v_response_due_at := (
    v_received_local + case extract(isodow from v_received_local)
      when 5 then interval '3 days'
      when 6 then interval '2 days'
      else interval '1 day'
    end
  ) at time zone 'Pacific/Honolulu';

  insert into public.change_requests (
    market_id, target_table, target_id, base_version, diff,
    proposer_user_id, proposer_channel, sla_due_at
  ) values (
    v_listing.market_id, 'listings', v_listing.id, v_listing.version,
    jsonb_build_object('field', p_field, 'details', trim(p_details)),
    auth.uid(), 'assisted_' || p_channel,
    now() + interval '48 hours'
  ) returning id into v_change_request_id;

  insert into public.assisted_messages (
    market_id, listing_id, channel, locale, from_address, body,
    received_at, response_due_at, linked_change_request_id, recorded_by
  ) values (
    v_listing.market_id, v_listing.id, p_channel, p_locale,
    trim(p_from_address), trim(p_body), p_received_at, v_response_due_at,
    v_change_request_id, auth.uid()
  );

  return v_change_request_id;
end;
$$;

create or replace function public.record_assisted_response(
  p_message_id uuid,
  p_response_note text
)
returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  if not public.is_platform(array['ops_agent', 'editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: assisted response recording requires operations staff';
  end if;
  if public.is_platform(array['editor', 'publisher', 'super_admin'])
     and public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: privileged assisted response recording requires recent MFA';
  end if;
  if length(trim(coalesce(p_response_note, ''))) not between 3 and 2000 then
    raise exception 'invalid_assisted_response_note';
  end if;

  update public.assisted_messages set
    responded_at = now(),
    response_note = trim(p_response_note),
    responded_by = auth.uid()
  where id = p_message_id and responded_at is null;
  if not found then raise exception 'assisted_message_not_open'; end if;
end;
$$;

revoke all on function public.record_assisted_update(uuid, text, text, text, text, text, text, timestamptz)
  from public, anon, service_role;
revoke all on function public.record_assisted_response(uuid, text)
  from public, anon, service_role;
grant execute on function public.record_assisted_update(uuid, text, text, text, text, text, text, timestamptz)
  to authenticated;
grant execute on function public.record_assisted_response(uuid, text)
  to authenticated;
