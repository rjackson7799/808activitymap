-- GENERATED FILE — DO NOT EDIT.
-- Source: db/rls/matrix.ts (PRD §4 contract) ∧ db/rls/availability.ts
-- (slice mask), rendered by db/rls/generate.ts.
--
-- Regenerate:            npm run rls:generate
-- Post-ship changes:     bump OUTPUT_MIGRATION in db/rls/config.ts — a NEW
--                        file is generated (self-contained: drops all
--                        generated policies, recreates full state); shipped
--                        generated migrations are never edited.
-- Hand-written policies: must never be named {table}_{op} — the
--                        drop-preamble below removes any policy matching
--                        that pattern.


-- Drop every previously generated policy (discovery-based: no knowledge of
-- the prior version needed; self-contained full state follows).
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname ~ '^[a-z0-9_]+_(select|insert|update|delete)$'
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;


-- ── app_config ──────────────────────────────────────────────────────────

create policy app_config_select on public.app_config
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy app_config_insert on public.app_config
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy app_config_update on public.app_config
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy app_config_delete on public.app_config
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.app_config from authenticated;
grant select, insert, update, delete on table public.app_config to authenticated;

-- ── audit_log ───────────────────────────────────────────────────────────

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])))
    or ((select public.is_platform(array['editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])) and actor = (select auth.uid()))
  );

revoke all on table public.audit_log from authenticated;
grant select on table public.audit_log to authenticated;

-- ── categories ──────────────────────────────────────────────────────────

create policy categories_select on public.categories
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy categories_insert on public.categories
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy categories_update on public.categories
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy categories_delete on public.categories
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.categories from authenticated;
grant select, insert, update, delete on table public.categories to authenticated;

-- ── category_locales ────────────────────────────────────────────────────

create policy category_locales_select on public.category_locales
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy category_locales_insert on public.category_locales
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy category_locales_update on public.category_locales
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy category_locales_delete on public.category_locales
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.category_locales from authenticated;
grant select, insert, update, delete on table public.category_locales to authenticated;

-- ── hours_exceptions ────────────────────────────────────────────────────

create policy hours_exceptions_select on public.hours_exceptions
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy hours_exceptions_insert on public.hours_exceptions
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy hours_exceptions_update on public.hours_exceptions
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy hours_exceptions_delete on public.hours_exceptions
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.hours_exceptions from authenticated;
grant select, insert, update, delete on table public.hours_exceptions to authenticated;

-- ── hours_sets ──────────────────────────────────────────────────────────

create policy hours_sets_select on public.hours_sets
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy hours_sets_insert on public.hours_sets
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy hours_sets_update on public.hours_sets
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy hours_sets_delete on public.hours_sets
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.hours_sets from authenticated;
grant select, insert, update, delete on table public.hours_sets to authenticated;

-- ── listing_categories ──────────────────────────────────────────────────

create policy listing_categories_select on public.listing_categories
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy listing_categories_insert on public.listing_categories
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy listing_categories_update on public.listing_categories
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy listing_categories_delete on public.listing_categories
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.listing_categories from authenticated;
grant select, insert, update, delete on table public.listing_categories to authenticated;

-- ── listing_locales ─────────────────────────────────────────────────────

create policy listing_locales_select on public.listing_locales
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy listing_locales_insert on public.listing_locales
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy listing_locales_update on public.listing_locales
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy listing_locales_delete on public.listing_locales
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.listing_locales from authenticated;
grant select, delete on table public.listing_locales to authenticated;
do $$  -- insert/update grants exclude fn-owned columns: status
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'listing_locales'
    and column_name not in ('status');
  execute format('grant insert (%1$s), update (%1$s) on table public.listing_locales to authenticated', cols);
end $$;

-- ── listing_media ───────────────────────────────────────────────────────

create policy listing_media_select on public.listing_media
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy listing_media_insert on public.listing_media
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.listing_media from authenticated;
grant select, insert on table public.listing_media to authenticated;

-- ── listings ────────────────────────────────────────────────────────────

create policy listings_select on public.listings
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy listings_insert on public.listings
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy listings_update on public.listings
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy listings_delete on public.listings
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.listings from authenticated;
grant select, delete on table public.listings to authenticated;
do $$  -- insert/update grants exclude fn-owned columns: publication_status
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'listings'
    and column_name not in ('publication_status');
  execute format('grant insert (%1$s), update (%1$s) on table public.listings to authenticated', cols);
end $$;

-- ── locations ───────────────────────────────────────────────────────────

create policy locations_select on public.locations
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy locations_insert on public.locations
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy locations_update on public.locations
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy locations_delete on public.locations
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.locations from authenticated;
grant select, insert, update, delete on table public.locations to authenticated;

-- ── markets ─────────────────────────────────────────────────────────────

create policy markets_select on public.markets
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy markets_insert on public.markets
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy markets_update on public.markets
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy markets_delete on public.markets
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.markets from authenticated;
grant select, insert, update, delete on table public.markets to authenticated;

-- ── media ───────────────────────────────────────────────────────────────

create policy media_select on public.media
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy media_insert on public.media
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

create policy media_update on public.media
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy media_delete on public.media
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.media from authenticated;
grant select, insert, update, delete on table public.media to authenticated;

-- ── media_locales ───────────────────────────────────────────────────────

create policy media_locales_select on public.media_locales
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy media_locales_insert on public.media_locales
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy media_locales_update on public.media_locales
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy media_locales_delete on public.media_locales
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.media_locales from authenticated;
grant select, insert, update, delete on table public.media_locales to authenticated;

-- ── menu_documents ──────────────────────────────────────────────────────

create policy menu_documents_select on public.menu_documents
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy menu_documents_insert on public.menu_documents
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

create policy menu_documents_update on public.menu_documents
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

create policy menu_documents_delete on public.menu_documents
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

revoke all on table public.menu_documents from authenticated;
grant select, insert, update, delete on table public.menu_documents to authenticated;

-- ── menu_item_locales ───────────────────────────────────────────────────

create policy menu_item_locales_select on public.menu_item_locales
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy menu_item_locales_insert on public.menu_item_locales
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy menu_item_locales_update on public.menu_item_locales
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy menu_item_locales_delete on public.menu_item_locales
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.menu_item_locales from authenticated;
grant select, insert, update, delete on table public.menu_item_locales to authenticated;

-- ── menu_items ──────────────────────────────────────────────────────────

create policy menu_items_select on public.menu_items
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy menu_items_insert on public.menu_items
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

create policy menu_items_update on public.menu_items
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

create policy menu_items_delete on public.menu_items
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

revoke all on table public.menu_items from authenticated;
grant select, insert, update, delete on table public.menu_items to authenticated;

-- ── menu_section_locales ────────────────────────────────────────────────

create policy menu_section_locales_select on public.menu_section_locales
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy menu_section_locales_insert on public.menu_section_locales
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy menu_section_locales_update on public.menu_section_locales
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['language_reviewer_ja'])) and locale = 'ja')
    or ((select public.is_platform(array['language_reviewer_ko'])) and locale = 'ko')
  );

create policy menu_section_locales_delete on public.menu_section_locales
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.menu_section_locales from authenticated;
grant select, insert, update, delete on table public.menu_section_locales to authenticated;

-- ── menu_sections ───────────────────────────────────────────────────────

create policy menu_sections_select on public.menu_sections
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy menu_sections_insert on public.menu_sections
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

create policy menu_sections_update on public.menu_sections
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

create policy menu_sections_delete on public.menu_sections
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

revoke all on table public.menu_sections from authenticated;
grant select, insert, update, delete on table public.menu_sections to authenticated;

-- ── menu_version_locales ────────────────────────────────────────────────

create policy menu_version_locales_select on public.menu_version_locales
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy menu_version_locales_insert on public.menu_version_locales
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

revoke all on table public.menu_version_locales from authenticated;
grant select on table public.menu_version_locales to authenticated;
do $$  -- insert grants exclude fn-owned columns: status, approval_type, approval_evidence_media_id, approved_by, approved_at
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by column_name) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'menu_version_locales'
    and column_name not in ('approval_evidence_media_id', 'approval_type', 'approved_at', 'approved_by', 'status');
  execute format('grant insert (%1$s) on table public.menu_version_locales to authenticated', cols);
end $$;

-- ── menu_versions ───────────────────────────────────────────────────────

create policy menu_versions_select on public.menu_versions
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy menu_versions_insert on public.menu_versions
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

create policy menu_versions_update on public.menu_versions
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

create policy menu_versions_delete on public.menu_versions
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
    or ((select public.is_platform(array['ops_agent'])))
  );

revoke all on table public.menu_versions from authenticated;
grant select, insert, update, delete on table public.menu_versions to authenticated;

-- ── organizations ───────────────────────────────────────────────────────

create policy organizations_select on public.organizations
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy organizations_update on public.organizations
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.organizations from authenticated;
grant select, insert, update, delete on table public.organizations to authenticated;

-- ── provenance ──────────────────────────────────────────────────────────

create policy provenance_select on public.provenance
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

revoke all on table public.provenance from authenticated;
grant select on table public.provenance to authenticated;

-- ── slug_aliases ────────────────────────────────────────────────────────

create policy slug_aliases_select on public.slug_aliases
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])))
  );

create policy slug_aliases_insert on public.slug_aliases
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy slug_aliases_update on public.slug_aliases
  for update to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  )
  with check (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

create policy slug_aliases_delete on public.slug_aliases
  for delete to authenticated
  using (
    ((select public.is_platform(array['super_admin', 'publisher', 'editor'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.slug_aliases from authenticated;
grant select, insert, update, delete on table public.slug_aliases to authenticated;

-- ── user_roles ──────────────────────────────────────────────────────────

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (
    ((select public.is_platform(array['super_admin'])))
    or ((select public.is_platform(array['super_admin', 'publisher', 'editor', 'language_reviewer_ja', 'language_reviewer_ko', 'ops_agent'])) and user_id = (select auth.uid()))
  );

create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (
    ((select public.is_platform(array['super_admin'])) and (select public.jwt_aal()) = 'aal2')
  );

revoke all on table public.user_roles from authenticated;
grant select, insert on table public.user_roles to authenticated;
