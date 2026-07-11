-- Migration 7: taxonomy — categories + per-locale labels/slugs.
-- publicly_visible implements D4 (hidden Activities subtree exists in data
-- but is excluded from every public surface at every level).

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  sort integer not null default 0,
  active boolean not null default true,
  publicly_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, market_id)
);

create index categories_parent_idx on public.categories (parent_id);

alter table public.categories enable row level security;
revoke all on table public.categories from anon;

create trigger categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger audit_categories
  after insert or update or delete on public.categories
  for each row execute function public.write_audit();

-- Locale label + slug are publish prerequisites for any listing whose primary
-- category this is (publication contract: category_integrity).
create table public.category_locales (
  category_id uuid not null references public.categories (id) on delete cascade,
  locale text not null
    constraint category_locales_locale_check check (locale in ('en', 'ja', 'ko')),
  label text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category_id, locale),
  unique (locale, slug)
);

alter table public.category_locales enable row level security;
revoke all on table public.category_locales from anon;

create trigger category_locales_updated_at
  before update on public.category_locales
  for each row execute function public.set_updated_at();

create trigger audit_category_locales
  after insert or update or delete on public.category_locales
  for each row execute function public.write_audit();
