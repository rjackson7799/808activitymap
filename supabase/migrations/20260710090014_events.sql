-- Migration 14: first-party analytics events (PRD §16 dictionary is the
-- contract; the typed dictionary lives in /lib/analytics, CP5).
--
-- Monthly RANGE partitions + a default catch-all. A scheduled job (CP5 cron)
-- calls ensure_events_partitions() and alerts if the default partition is
-- ever non-empty (rows landing there mean partition creation fell behind).
-- Retention is an app_config value (retention_days.events); the enforcement
-- job is deferred — noted in the slice plan.

create table public.events (
  id uuid not null default gen_random_uuid(),
  name text not null,
  ts timestamptz not null default now(),
  session_id text,
  locale text
    constraint events_locale_check check (locale is null or locale in ('en', 'ja', 'ko')),
  market_id text not null default 'oahu-waikiki',
  listing_id uuid,
  vendor_org_id uuid,
  props jsonb not null default '{}'::jsonb,
  source text not null
    constraint events_source_check check (source in ('client', 'server')),
  consent_class text,
  referrer_class text
    constraint events_referrer_class_check check (
      referrer_class is null or referrer_class in (
        'organic', 'ai', 'social', 'direct', 'influencer', 'qr', 'unknown'
      )
    ),
  primary key (id, ts)
) partition by range (ts);

-- PG15 propagates parent indexes to all partitions, present and future.
create index events_name_ts_idx on public.events (name, ts);
create index events_listing_ts_idx on public.events (listing_id, ts) where listing_id is not null;
create index events_session_ts_idx on public.events (session_id, ts);

alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;

-- Partitions are directly addressable tables: each one must be locked down
-- itself (RLS + revoked grants), or Supabase's default privileges would let
-- anon read a partition directly while the parent stays deny-all.
create table public.events_default partition of public.events default;
alter table public.events_default enable row level security;
revoke all on table public.events_default from anon, authenticated;

-- Idempotent partition creation, advisory-locked against concurrent runs
-- (cron overlap, parallel deploys).
create or replace function public.ensure_events_partitions(p_months_ahead integer default 3)
returns integer
security definer
set search_path = public
language plpgsql
as $$
declare
  v_start date;
  v_month date;
  v_name text;
  v_created integer := 0;
begin
  if p_months_ahead < 0 or p_months_ahead > 36 then
    raise exception 'ensure_events_partitions: months_ahead must be 0..36';
  end if;

  perform pg_advisory_xact_lock(hashtext('ensure_events_partitions'));

  v_start := date_trunc('month', now())::date;
  for i in 0 .. p_months_ahead loop
    v_month := (v_start + (i || ' months')::interval)::date;
    v_name := format('events_y%sm%s',
      to_char(v_month, 'YYYY'), to_char(v_month, 'MM'));
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_name
    ) then
      execute format(
        'create table public.%I partition of public.events for values from (%L) to (%L)',
        v_name, v_month, (v_month + interval '1 month')::date
      );
      execute format('alter table public.%I enable row level security', v_name);
      execute format('revoke all on table public.%I from anon, authenticated', v_name);
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end;
$$;

revoke execute on function public.ensure_events_partitions(integer) from public, anon, authenticated;

select public.ensure_events_partitions(3);
