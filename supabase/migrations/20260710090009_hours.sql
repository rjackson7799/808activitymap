-- Migration 9: hours_sets + hours_exceptions (PRD P1-4).
--
-- Layering: SQL CHECKs validate basic JSON *shape* (weekday keys, HH:MM
-- times, span-array shape, zero-length spans, contradictory unknown/24h
-- flags). Semantic rules (overlap detection, overnight resolution,
-- last-order math, open-now) live in /lib/hours (later checkpoint) and are
-- tested at both layers.
--
-- Weekly shape: {"mon": <day>, ..., "sun": <day>} — all seven days required
-- unless the set is flagged unknown (then weekly must be {}).
-- Day shape: exactly one of
--   {"closed": true} | {"is_24h": true} | {"spans": [{"open":"HH:MM","close":"HH:MM"}, ...]}
-- Overnight is represented as close < open within one span (e.g. 18:00–02:00).

create or replace function public.validate_hours_spans(p_spans jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_span jsonb;
  v_open text;
  v_close text;
begin
  if p_spans is null or jsonb_typeof(p_spans) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_spans) = 0 then
    return false;
  end if;
  for v_span in select jsonb_array_elements(p_spans) loop
    if jsonb_typeof(v_span) <> 'object' then
      return false;
    end if;
    -- exactly the two keys open/close
    if (select count(*) from jsonb_object_keys(v_span)) <> 2
       or v_span->>'open' is null or v_span->>'close' is null then
      return false;
    end if;
    v_open := v_span->>'open';
    v_close := v_span->>'close';
    if v_open !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or v_close !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;
    -- zero-length span (open == close) is malformed; use is_24h for 24 hours
    if v_open = v_close then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.validate_hours_weekly(p_weekly jsonb, p_unknown boolean)
returns boolean
language plpgsql
immutable
as $$
declare
  v_days constant text[] := array['mon','tue','wed','thu','fri','sat','sun'];
  v_day text;
  v_value jsonb;
  v_key_count int;
begin
  if p_weekly is null or jsonb_typeof(p_weekly) <> 'object' then
    return false;
  end if;

  -- unknown hours: pre-launch only state; weekly must be empty (contradiction guard)
  if p_unknown then
    return p_weekly = '{}'::jsonb;
  end if;

  -- no stray keys beyond the seven weekdays
  if exists (
    select 1 from jsonb_object_keys(p_weekly) as t(k)
    where k <> all (v_days)
  ) then
    return false;
  end if;

  foreach v_day in array v_days loop
    v_value := p_weekly->v_day;
    if v_value is null or jsonb_typeof(v_value) <> 'object' then
      return false; -- every day must be present and an object
    end if;

    v_key_count :=
      (case when v_value ? 'closed' then 1 else 0 end) +
      (case when v_value ? 'is_24h' then 1 else 0 end) +
      (case when v_value ? 'spans' then 1 else 0 end);

    -- exactly one representation per day; no contradictory flag combinations
    if v_key_count <> 1
       or (select count(*) from jsonb_object_keys(v_value)) <> 1 then
      return false;
    end if;

    if v_value ? 'closed' then
      if v_value->'closed' <> 'true'::jsonb then
        return false;
      end if;
    elsif v_value ? 'is_24h' then
      if v_value->'is_24h' <> 'true'::jsonb then
        return false;
      end if;
    else
      if not public.validate_hours_spans(v_value->'spans') then
        return false;
      end if;
    end if;
  end loop;

  return true;
end;
$$;

create table public.hours_sets (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references public.locations (id) on delete cascade,
  weekly jsonb not null default '{}'::jsonb,
  last_order_offset_min integer
    constraint hours_sets_last_order_check check (
      last_order_offset_min is null or last_order_offset_min >= 0
    ),
  kitchen_note text,
  sells_out_early boolean not null default false,
  appointment_only boolean not null default false,
  unknown boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hours_sets_weekly_shape_check
    check (public.validate_hours_weekly(weekly, unknown))
);

alter table public.hours_sets enable row level security;
revoke all on table public.hours_sets from anon;

create trigger hours_sets_updated_at
  before update on public.hours_sets
  for each row execute function public.set_updated_at();

create trigger audit_hours_sets
  after insert or update or delete on public.hours_sets
  for each row execute function public.write_audit();

create table public.hours_exceptions (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  date date not null,
  closed boolean not null default false,
  spans jsonb,
  reason text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, date),
  -- closed-day exceptions carry no spans; open-with-special-hours must carry
  -- a well-formed span array
  constraint hours_exceptions_spans_check check (
    (closed and spans is null)
    or (not closed and public.validate_hours_spans(spans))
  )
);

alter table public.hours_exceptions enable row level security;
revoke all on table public.hours_exceptions from anon;

create trigger hours_exceptions_updated_at
  before update on public.hours_exceptions
  for each row execute function public.set_updated_at();

create trigger audit_hours_exceptions
  after insert or update or delete on public.hours_exceptions
  for each row execute function public.write_audit();
