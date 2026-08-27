-- CP5 forward-only analytics contract and retention correction.
--
-- The original events migration permitted null locale/session values while
-- ingestion was deferred. CP5 now has a complete ingestion path, and PRD §16
-- requires locale + market on every event and a first-party session. NOT VALID
-- preserves legacy rows without inventing data; PostgreSQL still enforces each
-- constraint for every new row.

alter table public.events
  add constraint events_locale_required
  check (locale is not null) not valid;

alter table public.events
  add constraint events_session_required
  check (session_id is not null and btrim(session_id) <> '') not valid;

alter table public.events
  add constraint events_market_nonempty
  check (btrim(market_id) <> '') not valid;

-- Enforce retention_days.events without exposing direct DELETE privileges to
-- the application. The authenticated cron calls this as service_role.
create or replace function public.prune_events(p_retain_days integer)
returns integer
security definer
set search_path = public
language plpgsql
as $$
declare
  v_deleted integer;
begin
  if p_retain_days <= 0 then
    raise exception 'prune_events: retain_days must be positive';
  end if;

  delete from public.events
  where ts < now() - make_interval(days => p_retain_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.prune_events(integer) from public, anon, authenticated;
grant execute on function public.prune_events(integer) to service_role;

