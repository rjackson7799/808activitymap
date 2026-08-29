-- Phase 0 trust/corrections: immutable public proposals + staff-owned review.
-- Public callers never receive table grants; the application validates and
-- inserts with the service role. Staff visibility and resolution are RLS-bound
-- in the generated policy migration that follows this file.

alter table public.listings
  add column version integer not null default 1
    constraint listings_version_positive check (version > 0);

create or replace function public.bump_listing_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger listings_bump_version
  before update on public.listings
  for each row execute function public.bump_listing_version();

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  target_table text not null default 'listings'
    constraint change_requests_target_table_check check (target_table = 'listings'),
  target_id uuid not null references public.listings (id) on delete restrict,
  base_version integer not null constraint change_requests_base_version_positive check (base_version > 0),
  diff jsonb not null,
  proposer_user_id uuid,
  proposer_channel text not null default 'contributor'
    constraint change_requests_channel_check check (
      proposer_channel in ('portal', 'assisted_email', 'assisted_sms', 'contributor')
    ),
  reporter_name text,
  reporter_email text,
  evidence_media_id uuid references public.media (id) on delete restrict,
  status text not null default 'open'
    constraint change_requests_status_check check (
      status in ('open', 'merged', 'rejected', 'overridden')
    ),
  assignee uuid,
  sla_due_at timestamptz not null,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint change_requests_diff_shape check (
    jsonb_typeof(diff) = 'object'
    and diff ? 'field'
    and diff ? 'details'
    and diff->>'field' in ('name', 'address', 'phone', 'hours', 'menu', 'closure', 'other')
    and length(diff->>'details') between 10 and 2000
  ),
  constraint change_requests_reporter_name_length check (
    reporter_name is null or length(reporter_name) between 1 and 100
  ),
  constraint change_requests_reporter_email_length check (
    reporter_email is null or length(reporter_email) between 3 and 320
  ),
  constraint change_requests_resolution_consistency check (
    (status = 'open' and resolved_by is null and resolved_at is null and resolution_note is null)
    or
    (status <> 'open' and resolved_by is not null and resolved_at is not null
      and length(resolution_note) between 3 and 2000)
  )
);

create index change_requests_queue_idx
  on public.change_requests (status, sla_due_at, created_at);
create index change_requests_target_idx
  on public.change_requests (target_id, created_at desc);
create index change_requests_assignee_idx
  on public.change_requests (assignee, status, created_at);

alter table public.change_requests enable row level security;
revoke all on table public.change_requests from anon, authenticated;

create trigger change_requests_updated_at
  before update on public.change_requests
  for each row execute function public.set_updated_at();

-- Contact details are operationally necessary but excluded from audit
-- snapshots so the append-only log does not duplicate retained PII.
create trigger audit_change_requests
  after insert or update or delete on public.change_requests
  for each row execute function public.write_audit('reporter_name', 'reporter_email');

create or replace function public.assign_change_request(p_id uuid)
returns void
security definer
set search_path = public
language plpgsql
as $$
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: correction assignment requires editorial staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: correction assignment requires recent MFA';
  end if;
  update public.change_requests
  set assignee = auth.uid()
  where id = p_id and status = 'open';
  if not found then raise exception 'change_request_not_open'; end if;
end;
$$;

create or replace function public.resolve_change_request(
  p_id uuid,
  p_status text,
  p_resolution_note text
)
returns void
security definer
set search_path = public
language plpgsql
as $$
declare
  v_request public.change_requests%rowtype;
  v_current_version integer;
begin
  if not public.is_platform(array['editor', 'publisher', 'super_admin']) then
    raise exception 'permission_denied: correction resolution requires editorial staff';
  end if;
  if public.jwt_aal() is distinct from 'aal2' then
    raise exception 'aal2_required: correction resolution requires recent MFA';
  end if;
  if p_status not in ('merged', 'rejected', 'overridden') then
    raise exception 'invalid_change_request_status';
  end if;
  if length(trim(coalesce(p_resolution_note, ''))) not between 3 and 2000 then
    raise exception 'invalid_resolution_note';
  end if;

  select * into v_request from public.change_requests where id = p_id and status = 'open' for update;
  if not found then raise exception 'change_request_not_open'; end if;
  if p_status = 'merged' then
    select version into v_current_version from public.listings where id = v_request.target_id;
    if v_current_version is distinct from v_request.base_version then
      raise exception 'version_conflict: listing changed after this report';
    end if;
  end if;

  update public.change_requests set
    status = p_status,
    assignee = auth.uid(),
    resolved_by = auth.uid(),
    resolved_at = now(),
    resolution_note = trim(p_resolution_note),
    reporter_name = null,
    reporter_email = null
  where id = p_id;
end;
$$;

revoke all on function public.assign_change_request(uuid) from public, anon, service_role;
revoke all on function public.resolve_change_request(uuid, text, text) from public, anon, service_role;
grant execute on function public.assign_change_request(uuid) to authenticated;
grant execute on function public.resolve_change_request(uuid, text, text) to authenticated;

insert into public.app_config (key, value, description)
values (
  'correction_rate_limits',
  '{"per_ip":5,"per_session":3}'::jsonb,
  'Fixed-window rate limits for public correction intake'
)
on conflict (key) do update set value = excluded.value, description = excluded.description;
