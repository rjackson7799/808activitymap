-- Migration 12: provenance (P0-10) — every published fact carries provenance.
--
-- Semantics:
--  * polymorphic target, but target_table is ALLOWLISTED (CHECK) and the
--    field name is validated per-table inside the upsert function;
--  * exactly one CURRENT row per (target_table, target_id, field) — partial
--    unique index; superseding writes history (is_current=false), rows are
--    never deleted and history rows never mutate (triggers below);
--  * `import` is not a legal supplied_by value — approved first-party
--    migrations use `migration_first_party` (PRD P0-10);
--  * fact-changing admin mutations must refresh provenance through
--    upsert_provenance() — stale verification never silently survives a fact
--    change (service-layer rule from CP3 on; the function is the only write
--    path either way).

create table public.provenance (
  id uuid primary key default gen_random_uuid(),
  target_table text not null
    constraint provenance_target_table_check check (
      target_table in (
        'listings', 'locations', 'hours_sets', 'listing_locales',
        'media', 'menu_versions'
      )
    ),
  target_id uuid not null,
  field text not null,
  supplied_by text not null
    constraint provenance_supplied_by_check check (
      supplied_by in (
        'vendor', 'contributor', 'editor', 'ops_on_behalf', 'migration_first_party'
      )
    ),
  source_type text,
  verified_at timestamptz not null default now(),
  verified_by uuid,
  confidence numeric
    constraint provenance_confidence_check check (
      confidence is null or (confidence >= 0 and confidence <= 1)
    ),
  approval_status text not null default 'approved'
    constraint provenance_approval_status_check check (
      approval_status in ('pending', 'approved', 'rejected')
    ),
  expires_at timestamptz,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index provenance_current_key
  on public.provenance (target_table, target_id, field)
  where is_current;

create index provenance_target_idx
  on public.provenance (target_table, target_id);

alter table public.provenance enable row level security;
revoke all on table public.provenance from anon;

create trigger audit_provenance
  after insert or update or delete on public.provenance
  for each row execute function public.write_audit();

-- History is immutable: no deletes ever; the only legal update is the
-- supersede flip (is_current true→false, nothing else changed).
create or replace function public.provenance_immutable_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'provenance rows are never deleted (history is permanent)';
  end if;

  if old.is_current and not new.is_current
     and new.id = old.id
     and new.target_table = old.target_table
     and new.target_id = old.target_id
     and new.field = old.field
     and new.supplied_by = old.supplied_by
     and new.source_type is not distinct from old.source_type
     and new.verified_at = old.verified_at
     and new.verified_by is not distinct from old.verified_by
     and new.confidence is not distinct from old.confidence
     and new.approval_status = old.approval_status
     and new.expires_at is not distinct from old.expires_at
     and new.created_at = old.created_at then
    return new;
  end if;

  raise exception
    'provenance rows are immutable except the supersede flip (is_current true→false)';
end;
$$;

create trigger provenance_immutable
  before update or delete on public.provenance
  for each row execute function public.provenance_immutable_guard();

-- Per-table field allowlist. Adding a field here is a deliberate migration.
create or replace function public.provenance_allowed_fields(p_target_table text)
returns text[]
language sql
immutable
as $$
  select case p_target_table
    when 'listings' then array['name', 'price_band', 'attributes']
    when 'locations' then array['address', 'phone', 'geo', 'hours', 'operational_status']
    when 'hours_sets' then array['weekly']
    when 'listing_locales' then array['name', 'editorial_note']
    when 'media' then array['rights']
    when 'menu_versions' then array['content']
    else array[]::text[]
  end;
$$;

-- The single write path. SECURITY DEFINER: direct table writes stay denied
-- (RLS deny-all + immutability triggers) while any authorized service path
-- funnels through here. Returns the new current row's id.
create or replace function public.upsert_provenance(
  p_target_table text,
  p_target_id uuid,
  p_field text,
  p_supplied_by text,
  p_source_type text default null,
  p_verified_by uuid default null,
  p_confidence numeric default null,
  p_approval_status text default 'approved',
  p_expires_at timestamptz default null
)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare
  v_new_id uuid;
begin
  if p_field <> all (public.provenance_allowed_fields(p_target_table))
     and array_length(public.provenance_allowed_fields(p_target_table), 1) is not null then
    raise exception 'provenance field "%" is not allowlisted for table "%"',
      p_field, p_target_table;
  end if;
  if array_length(public.provenance_allowed_fields(p_target_table), 1) is null then
    raise exception 'provenance target_table "%" is not allowlisted', p_target_table;
  end if;

  update public.provenance
  set is_current = false
  where target_table = p_target_table
    and target_id = p_target_id
    and field = p_field
    and is_current;

  insert into public.provenance
    (target_table, target_id, field, supplied_by, source_type,
     verified_by, confidence, approval_status, expires_at, is_current)
  values
    (p_target_table, p_target_id, p_field, p_supplied_by, p_source_type,
     p_verified_by, p_confidence, p_approval_status, p_expires_at, true)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.upsert_provenance(text, uuid, text, text, text, uuid, numeric, text, timestamptz) from public, anon;
