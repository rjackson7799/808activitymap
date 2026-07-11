-- Migration 10: media + listing photo attachments + Storage buckets with
-- their policies (same migration, per slice plan).
--
-- Rights discipline (D17/P0-10): every media row carries rights metadata;
-- the publication contract blocks publishing listings whose attached photos
-- lack it. EXIF stripping is deferred to the upload-API slice (acknowledged);
-- Slice 1 seed ingestion follows the documented manual procedure (rights
-- recorded per asset before insert).
--
-- listing_media + media_locales complete the TSD's implicit photo model:
-- photos attach to listings with per-locale alt text. Alt text is the single
-- true identity-fallback field (QA'd EN allowed, flagged in data — ADR-008):
-- the flag is computed at read time (locale row missing → EN + flagged).

create table public.media (
  id uuid primary key default gen_random_uuid(),
  bucket text not null
    constraint media_bucket_check check (
      bucket in ('public-photos', 'menu-sources', 'evidence')
    ),
  path text not null,
  kind text not null
    constraint media_kind_check check (
      kind in ('photo', 'menu_source', 'evidence', 'report')
    ),
  rights jsonb,
  moderation_status text not null default 'pending'
    constraint media_moderation_status_check check (
      moderation_status in ('pending', 'approved', 'rejected')
    ),
  uploaded_by uuid,
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, path),
  unique (id, market_id),
  -- kind ↔ bucket coherence: public photos never share a bucket with private
  -- source/evidence documents
  constraint media_kind_bucket_check check (
    (kind = 'photo' and bucket = 'public-photos')
    or (kind = 'menu_source' and bucket = 'menu-sources')
    or (kind in ('evidence', 'report') and bucket = 'evidence')
  )
);

alter table public.media enable row level security;
revoke all on table public.media from anon;

create trigger media_updated_at
  before update on public.media
  for each row execute function public.set_updated_at();

-- rights payload (agreement refs, grantor identity) excluded from audit
-- snapshots; the row itself remains the system of record.
create trigger audit_media
  after insert or update or delete on public.media
  for each row execute function public.write_audit('rights');

create table public.listing_media (
  listing_id uuid not null,
  media_id uuid not null,
  position integer not null default 0,
  market_id text not null default 'oahu-waikiki' references public.markets (id),
  created_at timestamptz not null default now(),
  primary key (listing_id, media_id),
  foreign key (listing_id, market_id)
    references public.listings (id, market_id) on delete cascade,
  foreign key (media_id, market_id)
    references public.media (id, market_id) on delete restrict
);

alter table public.listing_media enable row level security;
revoke all on table public.listing_media from anon;

create trigger audit_listing_media
  after insert or update or delete on public.listing_media
  for each row execute function public.write_audit();

create table public.media_locales (
  media_id uuid not null references public.media (id) on delete cascade,
  locale text not null
    constraint media_locales_locale_check check (locale in ('en', 'ja', 'ko')),
  alt_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (media_id, locale)
);

alter table public.media_locales enable row level security;
revoke all on table public.media_locales from anon;

create trigger media_locales_updated_at
  before update on public.media_locales
  for each row execute function public.set_updated_at();

create trigger audit_media_locales
  after insert or update or delete on public.media_locales
  for each row execute function public.write_audit();

-- ── Storage buckets + policies (same migration by design) ───────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-photos', 'public-photos', true, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('menu-sources', 'menu-sources', false, 20971520,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('evidence', 'evidence', false, 20971520,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- public-photos: public read, staff-only writes.
create policy "public photos readable by all"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'public-photos');

create policy "public photos staff insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'public-photos'
    and public.is_platform(array['super_admin', 'publisher', 'editor', 'ops_agent'])
  );

create policy "public photos staff update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'public-photos'
    and public.is_platform(array['super_admin', 'publisher', 'editor', 'ops_agent'])
  );

create policy "public photos staff delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'public-photos'
    and public.is_platform(array['super_admin', 'publisher', 'editor', 'ops_agent'])
  );

-- menu-sources: NO select policy (deny-all reads; access is via short-TTL
-- signed URLs minted server-side). Menu uploads: editor+ and ops (on behalf).
create policy "menu sources staff insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-sources'
    and public.is_platform(array['super_admin', 'publisher', 'editor', 'ops_agent'])
  );

-- evidence: NO select policy; writes restricted to editor+ (PRD §19 —
-- evidence access is editor+ and every access audited at the app layer).
create policy "evidence staff insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence'
    and public.is_platform(array['super_admin', 'publisher', 'editor'])
  );
