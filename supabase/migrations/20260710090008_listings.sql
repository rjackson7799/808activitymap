-- Migration 8: listings + listing_locales + listing_categories.
--
-- Primary-category integrity (ADR-007): there is NO is_primary column on
-- listing_categories — listings.primary_category_id is the single source of
-- truth, enforced by a DEFERRED constraint trigger:
--   * the primary category must be attached via listing_categories,
--   * must be active,
--   * market match is structural (composite FKs), cross-market is impossible.
-- Deferred so the natural insert order (listing → listing_categories → set
-- primary) works inside one transaction.

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique,
  publication_status text not null default 'draft'
    constraint listings_publication_status_check check (
      publication_status in ('draft', 'review_pending', 'published', 'unpublished', 'archived')
    ),
  plan_tier_cache text,
  primary_category_id uuid,
  price_band text
    constraint listings_price_band_check check (
      price_band is null or price_band in ('$', '$$', '$$$', '$$$$')
    ),
  attributes jsonb not null default '{}'::jsonb,
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, market_id),
  foreign key (location_id, market_id)
    references public.locations (id, market_id) on delete restrict,
  foreign key (primary_category_id, market_id)
    references public.categories (id, market_id) on delete restrict
);

alter table public.listings enable row level security;
revoke all on table public.listings from anon;

create trigger listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

create trigger audit_listings
  after insert or update or delete on public.listings
  for each row execute function public.write_audit();

-- Per-language editorial + SEO content with its own workflow status (PRD §6).
create table public.listing_locales (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  locale text not null
    constraint listing_locales_locale_check check (locale in ('en', 'ja', 'ko')),
  status text not null default 'not_started'
    constraint listing_locales_status_check check (
      status in (
        'not_started', 'machine_draft', 'qa_pending', 'qa_approved',
        'vendor_review_pending', 'vendor_approved', 'published',
        'stale', 'withdrawn'
      )
    ),
  name text,
  slug text,
  seo_title text,
  seo_desc text,
  editorial_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, locale)
);

-- Slug uniqueness per locale; null slugs allowed pre-publication.
create unique index listing_locales_locale_slug_key
  on public.listing_locales (locale, slug)
  where slug is not null;

alter table public.listing_locales enable row level security;
revoke all on table public.listing_locales from anon;

create trigger listing_locales_updated_at
  before update on public.listing_locales
  for each row execute function public.set_updated_at();

create trigger audit_listing_locales
  after insert or update or delete on public.listing_locales
  for each row execute function public.write_audit();

-- Category attachments. Max subcategories is app_config (enforced in the
-- taxonomy service layer, PRD §22 — config, not constants).
create table public.listing_categories (
  listing_id uuid not null,
  category_id uuid not null,
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  created_at timestamptz not null default now(),
  primary key (listing_id, category_id),
  foreign key (listing_id, market_id)
    references public.listings (id, market_id) on delete cascade,
  foreign key (category_id, market_id)
    references public.categories (id, market_id) on delete restrict
);

alter table public.listing_categories enable row level security;
revoke all on table public.listing_categories from anon;

create trigger audit_listing_categories
  after insert or update or delete on public.listing_categories
  for each row execute function public.write_audit();

-- ── Primary-category integrity ──────────────────────────────────────────

create or replace function public.check_primary_category()
returns trigger
language plpgsql
as $$
declare
  v_listing_id uuid;
  v_primary uuid;
  v_active boolean;
begin
  if tg_table_name = 'listings' then
    v_listing_id := new.id;
    v_primary := new.primary_category_id;
  else
    -- listing_categories UPDATE/DELETE: re-check the affected listing.
    v_listing_id := old.listing_id;
    select l.primary_category_id into v_primary
    from public.listings l where l.id = v_listing_id;
  end if;

  if v_primary is null then
    return null; -- no primary set: publication contract blocks it later
  end if;

  if not exists (
    select 1 from public.listing_categories lc
    where lc.listing_id = v_listing_id and lc.category_id = v_primary
  ) then
    raise exception 'primary_category_integrity: category % is not attached to listing %',
      v_primary, v_listing_id;
  end if;

  select c.active into v_active from public.categories c where c.id = v_primary;
  if not coalesce(v_active, false) then
    raise exception 'primary_category_integrity: category % is not active', v_primary;
  end if;

  return null;
end;
$$;

create constraint trigger listings_primary_category_guard
  after insert or update of primary_category_id on public.listings
  deferrable initially deferred
  for each row
  when (new.primary_category_id is not null)
  execute function public.check_primary_category();

create constraint trigger listing_categories_primary_guard
  after update or delete on public.listing_categories
  deferrable initially deferred
  for each row
  execute function public.check_primary_category();
