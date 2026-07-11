-- Migration 13: slug_aliases (ADR-006 — replaces the TSD's `redirects` table;
-- aliases resolve in-page with a single-hop 301).
--
-- Invariants enforced here:
--  * scoped by route kind (listing vs category) + locale;
--  * an alias may never equal a canonical slug in the same (locale, scope) —
--    and a canonical slug may never be created/changed to collide with an
--    existing alias (both directions, both triggers);
--  * aliases point only at canonical targets (listings/categories, validated)
--    — chains are impossible by construction;
--  * every slug and alias is NFC-normalized on write, so uniqueness and
--    collision checks are NFC-equivalence-safe (JA native-script slugs,
--    PRD 6.12).

create table public.slug_aliases (
  id uuid primary key default gen_random_uuid(),
  route_scope text not null
    constraint slug_aliases_route_scope_check check (
      route_scope in ('listing', 'category')
    ),
  locale text not null
    constraint slug_aliases_locale_check check (locale in ('en', 'ja', 'ko')),
  alias_slug text not null,
  target_id uuid not null,
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  created_at timestamptz not null default now(),
  unique (route_scope, locale, alias_slug)
);

alter table public.slug_aliases enable row level security;
revoke all on table public.slug_aliases from anon;

create trigger audit_slug_aliases
  after insert or update or delete on public.slug_aliases
  for each row execute function public.write_audit();

create or replace function public.check_slug_alias()
returns trigger
language plpgsql
as $$
begin
  new.alias_slug := normalize(new.alias_slug, nfc);

  if new.route_scope = 'listing' then
    if not exists (select 1 from public.listings l where l.id = new.target_id) then
      raise exception 'slug_alias target listing % does not exist', new.target_id;
    end if;
    if exists (
      select 1 from public.listing_locales ll
      where ll.locale = new.locale and ll.slug = new.alias_slug
    ) then
      raise exception
        'slug_alias_collision: alias "%" equals a canonical listing slug in locale %',
        new.alias_slug, new.locale;
    end if;
  else
    if not exists (select 1 from public.categories c where c.id = new.target_id) then
      raise exception 'slug_alias target category % does not exist', new.target_id;
    end if;
    if exists (
      select 1 from public.category_locales cl
      where cl.locale = new.locale and cl.slug = new.alias_slug
    ) then
      raise exception
        'slug_alias_collision: alias "%" equals a canonical category slug in locale %',
        new.alias_slug, new.locale;
    end if;
  end if;

  return new;
end;
$$;

create trigger slug_aliases_guard
  before insert or update on public.slug_aliases
  for each row execute function public.check_slug_alias();

-- Reverse direction: canonical slug writes must NFC-normalize and must not
-- collide with an existing alias in the same (locale, scope).

create or replace function public.check_canonical_listing_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null then
    return new;
  end if;
  new.slug := normalize(new.slug, nfc);
  if exists (
    select 1 from public.slug_aliases a
    where a.route_scope = 'listing'
      and a.locale = new.locale
      and a.alias_slug = new.slug
      and a.target_id <> new.listing_id
  ) then
    raise exception
      'slug_alias_collision: canonical listing slug "%" collides with an alias in locale %',
      new.slug, new.locale;
  end if;
  return new;
end;
$$;

create trigger listing_locales_slug_guard
  before insert or update of slug on public.listing_locales
  for each row execute function public.check_canonical_listing_slug();

create or replace function public.check_canonical_category_slug()
returns trigger
language plpgsql
as $$
begin
  new.slug := normalize(new.slug, nfc);
  if exists (
    select 1 from public.slug_aliases a
    where a.route_scope = 'category'
      and a.locale = new.locale
      and a.alias_slug = new.slug
      and a.target_id <> new.category_id
  ) then
    raise exception
      'slug_alias_collision: canonical category slug "%" collides with an alias in locale %',
      new.slug, new.locale;
  end if;
  return new;
end;
$$;

create trigger category_locales_slug_guard
  before insert or update of slug on public.category_locales
  for each row execute function public.check_canonical_category_slug();
