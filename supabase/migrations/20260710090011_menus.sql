-- Migration 11: menu chain, top-down:
-- menu_documents → menu_versions → menu_version_locales
--                → menu_sections → menu_section_locales
--                → menu_items → menu_item_locales
--
-- Evidence rule (D1/D17, enforced here by constraint trigger): a
-- menu_version_locale may not reach {approved, published} — nor carry
-- approval_type 'vendor_approved_external' — without approval evidence media
-- + approving actor + timestamp, AND a rights record on the menu's source
-- media. The publication contract (migration 15) re-checks the same facts as
-- defense in depth.

create table public.menu_documents (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  source_media_id uuid not null references public.media (id) on delete restrict,
  captured_at timestamptz,
  captured_by uuid,
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (listing_id, market_id)
    references public.listings (id, market_id) on delete cascade
);

create index menu_documents_listing_idx on public.menu_documents (listing_id);

alter table public.menu_documents enable row level security;
revoke all on table public.menu_documents from anon;

create trigger menu_documents_updated_at
  before update on public.menu_documents
  for each row execute function public.set_updated_at();

create trigger audit_menu_documents
  after insert or update or delete on public.menu_documents
  for each row execute function public.write_audit();

create table public.menu_versions (
  id uuid primary key default gen_random_uuid(),
  menu_document_id uuid not null references public.menu_documents (id) on delete cascade,
  version integer not null
    constraint menu_versions_version_check check (version >= 1),
  status text not null default 'draft'
    constraint menu_versions_status_check check (
      status in ('draft', 'active', 'superseded')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_document_id, version)
);

alter table public.menu_versions enable row level security;
revoke all on table public.menu_versions from anon;

create trigger menu_versions_updated_at
  before update on public.menu_versions
  for each row execute function public.set_updated_at();

create trigger audit_menu_versions
  after insert or update or delete on public.menu_versions
  for each row execute function public.write_audit();

create table public.menu_version_locales (
  id uuid primary key default gen_random_uuid(),
  menu_version_id uuid not null references public.menu_versions (id) on delete cascade,
  locale text not null
    constraint menu_version_locales_locale_check check (locale in ('en', 'ja', 'ko')),
  status text not null default 'translation_pending'
    constraint menu_version_locales_status_check check (
      status in (
        'translation_pending', 'qa_pending', 'qa_approved',
        'vendor_approval_pending', 'approved', 'published',
        'superseded', 'rejected'
      )
    ),
  approval_type text
    constraint menu_version_locales_approval_type_check check (
      approval_type is null or approval_type in ('portal', 'vendor_approved_external')
    ),
  approval_evidence_media_id uuid references public.media (id) on delete restrict,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (menu_version_id, locale)
);

alter table public.menu_version_locales enable row level security;
revoke all on table public.menu_version_locales from anon;

create trigger menu_version_locales_updated_at
  before update on public.menu_version_locales
  for each row execute function public.set_updated_at();

create trigger audit_menu_version_locales
  after insert or update or delete on public.menu_version_locales
  for each row execute function public.write_audit();

create or replace function public.check_menu_locale_evidence()
returns trigger
language plpgsql
as $$
declare
  v_evidence_kind text;
  v_source_rights jsonb;
begin
  if new.status not in ('approved', 'published')
     and coalesce(new.approval_type, '') <> 'vendor_approved_external' then
    return null;
  end if;

  if new.approval_evidence_media_id is null
     or new.approved_by is null
     or new.approved_at is null then
    raise exception
      'menu_evidence_missing: menu_version_locale % (%) requires approval evidence media, approver and timestamp',
      new.id, new.locale;
  end if;

  select m.kind into v_evidence_kind
  from public.media m where m.id = new.approval_evidence_media_id;
  if v_evidence_kind is distinct from 'evidence' then
    raise exception
      'menu_evidence_missing: approval evidence media % must be kind=evidence',
      new.approval_evidence_media_id;
  end if;

  -- rights must be linked on the menu's source media (D17)
  select m.rights into v_source_rights
  from public.media m
  join public.menu_documents d on d.source_media_id = m.id
  join public.menu_versions v on v.menu_document_id = d.id
  where v.id = new.menu_version_id;

  if v_source_rights is null
     or v_source_rights->>'license' is null
     or v_source_rights->>'granted_by' is null then
    raise exception
      'menu_rights_unlinked: source media for menu_version % lacks a rights record',
      new.menu_version_id;
  end if;

  return null;
end;
$$;

create constraint trigger menu_version_locales_evidence_guard
  after insert or update on public.menu_version_locales
  for each row
  execute function public.check_menu_locale_evidence();

create table public.menu_sections (
  id uuid primary key default gen_random_uuid(),
  menu_version_id uuid not null references public.menu_versions (id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_sections_version_idx on public.menu_sections (menu_version_id);

alter table public.menu_sections enable row level security;
revoke all on table public.menu_sections from anon;

create trigger menu_sections_updated_at
  before update on public.menu_sections
  for each row execute function public.set_updated_at();

create trigger audit_menu_sections
  after insert or update or delete on public.menu_sections
  for each row execute function public.write_audit();

-- Section names are locale content (fallback matrix: no EN fallback on a JA
-- page). The TSD lists only menu_item_locales; section locales are the
-- schema-completing counterpart, noted in the build log.
create table public.menu_section_locales (
  section_id uuid not null references public.menu_sections (id) on delete cascade,
  locale text not null
    constraint menu_section_locales_locale_check check (locale in ('en', 'ja', 'ko')),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (section_id, locale)
);

alter table public.menu_section_locales enable row level security;
revoke all on table public.menu_section_locales from anon;

create trigger menu_section_locales_updated_at
  before update on public.menu_section_locales
  for each row execute function public.set_updated_at();

create trigger audit_menu_section_locales
  after insert or update or delete on public.menu_section_locales
  for each row execute function public.write_audit();

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.menu_sections (id) on delete cascade,
  position integer not null default 0,
  price_cents integer
    constraint menu_items_price_cents_check check (price_cents is null or price_cents >= 0),
  currency text not null default 'USD',
  price_type text not null default 'fixed'
    constraint menu_items_price_type_check check (
      price_type in ('fixed', 'market', 'from')
    ),
  variant text,
  flags jsonb not null default '{}'::jsonb,
  owner_pick boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- market price means "ask" — a stored amount would be a money-term lie
  constraint menu_items_market_price_check check (
    price_type <> 'market' or price_cents is null
  )
);

create index menu_items_section_idx on public.menu_items (section_id);

alter table public.menu_items enable row level security;
revoke all on table public.menu_items from anon;

create trigger menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

create trigger audit_menu_items
  after insert or update or delete on public.menu_items
  for each row execute function public.write_audit();

create table public.menu_item_locales (
  item_id uuid not null references public.menu_items (id) on delete cascade,
  locale text not null
    constraint menu_item_locales_locale_check check (locale in ('en', 'ja', 'ko')),
  original_name text,
  transliteration text,
  name text,
  description text,
  extraction_confidence numeric
    constraint menu_item_locales_confidence_check check (
      extraction_confidence is null
      or (extraction_confidence >= 0 and extraction_confidence <= 1)
    ),
  human_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, locale)
);

alter table public.menu_item_locales enable row level security;
revoke all on table public.menu_item_locales from anon;

create trigger menu_item_locales_updated_at
  before update on public.menu_item_locales
  for each row execute function public.set_updated_at();

create trigger audit_menu_item_locales
  after insert or update or delete on public.menu_item_locales
  for each row execute function public.write_audit();
