-- Migration 4: append-only audit log + write_audit() trigger.
--
-- Guarantees (slice-1 §Migrations #4):
--  * same-transaction: the trigger runs inside the mutating transaction, so a
--    mutation cannot commit without its audit row;
--  * append-only: UPDATE/DELETE raise, and normal roles hold no grants at all
--    (write_audit is SECURITY DEFINER — the only insert path);
--  * actor: auth.uid() for JWT paths; service operations attribute via
--    set_config('app.actor', <uuid>, true); neither → 'system';
--  * request/correlation id from the app.request_id GUC;
--  * evidence-payload columns are excluded from before/after snapshots by
--    listing them as trigger arguments (TG_ARGV).

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  actor_source text not null
    constraint audit_log_actor_source_check
      check (actor_source in ('jwt', 'service', 'system')),
  action text not null,
  target_table text not null,
  target_id text,
  before jsonb,
  after jsonb,
  request_id text,
  at timestamptz not null default now()
);

create index audit_log_target_idx on public.audit_log (target_table, target_id, at);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;

create or replace function public.raise_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only (%.% attempted %)',
    tg_table_schema, tg_table_name, tg_op;
end;
$$;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.raise_append_only();

create or replace function public.write_audit()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
declare
  v_actor uuid;
  v_source text;
  v_before jsonb;
  v_after jsonb;
  v_excluded text;
  v_target_id text;
begin
  -- Actor resolution: JWT subject, else service attribution GUC, else system.
  v_actor := auth.uid();
  if v_actor is not null then
    v_source := 'jwt';
  else
    begin
      v_actor := nullif(current_setting('app.actor', true), '')::uuid;
    exception when invalid_text_representation then
      v_actor := null;
    end;
    v_source := case when v_actor is null then 'system' else 'service' end;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_before := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_after := to_jsonb(new);
  end if;

  -- Evidence-payload exclusion: columns named as trigger args are stripped.
  for i in 0 .. tg_nargs - 1 loop
    v_excluded := tg_argv[i];
    v_before := v_before - v_excluded;
    v_after := v_after - v_excluded;
  end loop;

  v_target_id := coalesce(v_after->>'id', v_before->>'id');

  insert into public.audit_log
    (actor, actor_source, action, target_table, target_id, before, after, request_id)
  values (
    v_actor,
    v_source,
    tg_op,
    tg_table_name,
    v_target_id,
    v_before,
    v_after,
    nullif(current_setting('app.request_id', true), '')
  );

  return coalesce(new, old);
end;
$$;

-- Attach to the mutable tables that already exist; every later migration
-- attaches this trigger to the tables it creates.
create trigger audit_app_config
  after insert or update or delete on public.app_config
  for each row execute function public.write_audit();

create trigger audit_markets
  after insert or update or delete on public.markets
  for each row execute function public.write_audit();

create trigger audit_user_roles
  after insert or update or delete on public.user_roles
  for each row execute function public.write_audit();
