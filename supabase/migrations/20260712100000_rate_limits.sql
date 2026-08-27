-- Migration 19 (CP5): analytics ingestion hardening.
--
-- Adds the fixed-window `rate_limits` counter table and the two SECURITY
-- DEFINER RPCs the server-only /api/events route uses: `rate_limit_hit`
-- (atomic per-window increment) and `record_event` (the single sanctioned
-- write path into `events`, with canonical/eligible listing resolution).
--
-- Both RPCs are granted to service_role ONLY — never anon. The Supabase anon
-- key is public (shipped to browsers); an anon-callable ingest RPC would let
-- anyone bypass the route's bot-filter + rate-limit and insert arbitrary
-- events. The route runs on the Node runtime with the service client (the
-- ADR-004 posture: service-role reads already back every public render), and
-- the narrow record_event RPC keeps the write centralized + auditable rather
-- than spraying `.from('events').insert()` through a public handler.
--
-- `rate_limits` is an OPERATIONAL table like `events`: RLS enabled + all
-- grants revoked (deny-all; the DEFINER functions are the only access), zero
-- policies, and no write_audit trigger (high-churn, not content). It is added
-- to db/rls/config.ts CURRENT_TABLES but NOT to LIVE_TABLES, so the generated
-- RLS policy set is unchanged; the OUTPUT_MIGRATION bump that accompanies this
-- migration exists only to satisfy the generator's "sorts last" assertion.

-- ── rate_limits: fixed-window counters ─────────────────────────────────────
create table public.rate_limits (
  bucket text not null,                 -- e.g. 'events:ip', 'events:session'
  subject text not null,                -- hashed IP or session id — never a raw IP
  window_start timestamptz not null,    -- floored to the window boundary
  count integer not null default 0,
  primary key (bucket, subject, window_start)
);

-- Retention sweep (the CP5 cron deletes ip_abuse-aged rows) + window pruning.
create index rate_limits_window_start_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

-- ── rate_limit_hit: atomic fixed-window increment ──────────────────────────
-- One row per (bucket, subject, window). The upsert runs under the PK row
-- lock, so concurrent serverless instances serialize and `count` is exact
-- (correct across instances with no extra infrastructure — pilot scale).
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, hit_count integer, retry_after integer)
security definer
set search_path = public
language plpgsql
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 then
    raise exception 'rate_limit_hit: limit and window_seconds must be positive';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, subject, window_start, count)
  values (p_bucket, p_subject, v_window_start, 1)
  on conflict (bucket, subject, window_start)
  do update set count = rate_limits.count + 1
  returning count into v_count;

  return query select
    v_count <= p_limit,
    v_count,
    case
      when v_count <= p_limit then 0
      else ceil(extract(epoch from (
        v_window_start + make_interval(secs => p_window_seconds) - now()
      )))::integer
    end;
end;
$$;

revoke execute on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;

-- ── record_event: the single sanctioned write path into events ─────────────
-- Resolves the listing when a target is supplied (via listing_id or a
-- canonical slug), joined through the publishable_locale_pages eligibility
-- view. A listing-scoped hit whose target is not a currently-publishable,
-- canonical page is DROPPED (returns null) — this is how alias/404/ineligible
-- and just-unpublished hits are kept out of the authoritative count.
create or replace function public.record_event(
  p_name text,
  p_source text,
  p_props jsonb,
  p_session_id text,
  p_locale text,
  p_listing_id uuid,
  p_slug text,
  p_referrer_class text,
  p_consent_class text
)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare
  v_listing_id uuid;
  v_event_id uuid;
begin
  if p_listing_id is not null then
    select plp.listing_id into v_listing_id
    from public.publishable_locale_pages plp
    where plp.listing_id = p_listing_id and plp.locale = p_locale;
    if v_listing_id is null then
      return null; -- ineligible target → drop
    end if;
  elsif p_slug is not null then
    select plp.listing_id into v_listing_id
    from public.listing_locales ll
    join public.publishable_locale_pages plp
      on plp.listing_id = ll.listing_id and plp.locale = ll.locale
    where ll.locale = p_locale and ll.slug = p_slug
    limit 1;
    if v_listing_id is null then
      return null; -- non-canonical / ineligible slug → drop
    end if;
  end if;

  insert into public.events (
    name, source, props, session_id, locale, listing_id, referrer_class, consent_class
  )
  values (
    p_name, p_source, coalesce(p_props, '{}'::jsonb), p_session_id, p_locale,
    v_listing_id, p_referrer_class, p_consent_class
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke execute on function public.record_event(text, text, jsonb, text, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_event(text, text, jsonb, text, text, uuid, text, text, text) to service_role;

-- ── Maintenance helpers for the CP5 partition/retention cron ────────────────
-- The cron runs as service_role. ensure_events_partitions had its EXECUTE
-- revoked from public in migration 14 (never granted to service_role), so
-- grant it explicitly here (forward-only additive grant; migration 14 is
-- shipped and untouched).
grant execute on function public.ensure_events_partitions(integer) to service_role;

-- A non-empty events_default means partition creation fell behind — the CP5
-- cron alert condition (migration 14 header). DEFINER so the cron reads it
-- without a direct grant on the partition.
create or replace function public.events_default_count()
returns bigint
security definer
set search_path = public
language sql
as $$
  select count(*) from public.events_default;
$$;

revoke execute on function public.events_default_count() from public, anon, authenticated;
grant execute on function public.events_default_count() to service_role;

-- Retention sweep for the hashed-IP / session rate-limit rows
-- (retention_days.ip_abuse = 90d). Deletes rows whose window is older than the
-- retention horizon; returns the count deleted.
create or replace function public.prune_rate_limits(p_retain_days integer)
returns integer
security definer
set search_path = public
language plpgsql
as $$
declare
  v_deleted integer;
begin
  if p_retain_days <= 0 then
    raise exception 'prune_rate_limits: retain_days must be positive';
  end if;
  delete from public.rate_limits
  where window_start < now() - make_interval(days => p_retain_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.prune_rate_limits(integer) from public, anon, authenticated;
grant execute on function public.prune_rate_limits(integer) to service_role;
