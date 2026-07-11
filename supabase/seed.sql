-- Seed — LOCAL/STAGING ONLY. Never runs in production: `supabase db reset`
-- and the CI db job are the only consumers; deploys use `db push`, which
-- does not seed. Demo content is fixture data with fixture rights evidence —
-- real vendors require real permission records (PRD §18).
--
-- Deterministic fixed UUIDs (goldens + E2E stability):
--   a0…  organizations   b0…  locations      c0…  listings
--   d0…  listing_locales e0…  categories     f0…  media
--   90…  menu_documents  91…  menu_versions  92…  menu_version_locales
--   93…  menu_sections   94…  menu_items     99…  actor placeholders
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING keyed on deterministic
-- ids/uniques; re-running is a no-op. Statement order respects the deferred
-- primary-category trigger (listing → attach categories → set primary).
--
-- Staff auth users are NOT seeded — super_admin is provisioned per
-- environment from env-supplied credentials (CP2 script); tests simulate
-- roles via JWT-claim GUCs. Actor uuids below are placeholders (no FK to
-- auth.users on audit/approval columns by design).

-- ── app_config (PRD §22) ─────────────────────────────────────────────────
-- Values must equal APP_CONFIG_REGISTRY devDefaults in /config/app-config.ts
-- (asserted by tests/db/app-config-seed.test.ts — values live once in TS).

insert into public.app_config (key, value, description) values
  ('staleness_thresholds_days',
   '{"hours":90,"price":120,"menu":180,"business_fact":365,"editorial_note":90}',
   'Provenance staleness threshold per field type (days)'),
  ('badge_freshness_rules',
   '{"badge_fields":["hours","price"],"suspend_on_stale":true}',
   'Verified-badge auto-suspension rules (D15)'),
  ('public_surface_enabled', 'true',
   'Kill switch for the public surface (rollback acceptance)'),
  ('locale_availability', '{"oahu-waikiki":["en","ja"]}',
   'Publicly served locales per market; KO flips on in Slice 2'),
  ('extraction_confidence_threshold', '0.8',
   'Below this, price/allergen fields need human confirmation before QA'),
  ('max_subcategories_per_listing', '3',
   'Maximum subcategories attachable to one listing'),
  ('moderation_thresholds',
   '{"closure_reports_to_flag":2,"photo_flags_to_hide":3}',
   'Flag counts that open moderation cases / hide content'),
  ('queue_sla_targets_hours',
   '{"moderation":48,"qa_ja":72,"qa_ko":72,"claims":72,"corrections":48}',
   'Ops queue SLA targets in hours'),
  ('grace_period_days', '14', 'Days in grace after dunning exhausts'),
  ('dunning_schedule_days', '[0,3,7]', 'Dunning email offsets in days'),
  ('founding_price_hold_window_days', '30',
   'Founding-price hold window for lapsed subscribers (D13)'),
  ('plan_entitlements',
   '{"free":[],"founding":["badge","translated_menus","analytics","report","deals","priority","team_seats"]}',
   'Plan → entitlement-key map (consumed Slice 5)'),
  ('menu_approval_reminder_days', '[3,7,14]',
   'Vendor menu-approval reminder offsets'),
  ('onboarding_reminder_days', '[3,7]',
   'Onboarding-incomplete reminder offsets'),
  ('report_delivery_day', '3', 'Day of month monthly reports generate'),
  ('deal_expiration_behavior',
   '{"show_alternatives":true,"alternatives_count":3}',
   'Expired deal reveal: 410 + alternatives'),
  ('affiliate_module_ordering', '[]',
   'Ordered affiliate-module keys for listing pages'),
  ('referrer_classification',
   '{"version":1,"rules":[{"class":"qr","query_param":"qr"},{"class":"ai","referrer_contains":["chatgpt.com","chat.openai.com","claude.ai","perplexity.ai","gemini.google.com","copilot.microsoft.com"],"ua_contains":["GPTBot","ClaudeBot","Claude-User","PerplexityBot"]},{"class":"social","referrer_contains":["instagram.com","facebook.com","t.co","twitter.com","x.com","tiktok.com","youtube.com","line.me"]},{"class":"organic","referrer_contains":["google.","bing.com","duckduckgo.com","search.yahoo.","yahoo.co.jp","naver.com","daum.net"]}]}',
   'Versioned referrer→class rules (D21); unknown is the implicit fallback'),
  ('robots_allowlist',
   '["GPTBot","ClaudeBot","Claude-User","PerplexityBot","Google-Extended","Bingbot"]',
   'AI-crawler allowlist for robots.txt (PRD §15, quarterly review)'),
  ('bot_filter',
   '{"ua_contains":["bot","crawler","spider","curl","wget","python-requests","headless","lighthouse","pingdom","uptimerobot"]}',
   'Analytics ingestion bot filter (silent drop)'),
  ('rate_limits',
   '{"window_minutes":10,"events_per_ip":600,"events_per_session":300,"reveals_per_ip":30}',
   'Fixed-window rate limits for public endpoints'),
  ('retention_days',
   '{"events":730,"ip_abuse":90,"claim_evidence":730}',
   'Retention obligations (PRD §19)')
on conflict (key) do nothing;

-- ── Taxonomy (D4: Activities subtree exists but is publicly hidden) ─────

insert into public.categories (id, parent_id, sort, active, publicly_visible) values
  ('e0000000-0000-4000-8000-000000000001', null, 0, true, true),   -- Dining (root)
  ('e0000000-0000-4000-8000-000000000002', null, 1, true, false),  -- Activities (root, hidden)
  ('e0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001', 0, true, true),   -- Ramen
  ('e0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000001', 1, true, true),   -- Sushi
  ('e0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000001', 2, true, true),   -- Cafés & Coffee
  ('e0000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-000000000001', 3, true, true),   -- Izakaya
  ('e0000000-0000-4000-8000-000000000021', 'e0000000-0000-4000-8000-000000000002', 0, true, false)   -- Surf Lessons (hidden subtree)
on conflict (id) do nothing;

insert into public.category_locales (category_id, locale, label, slug) values
  ('e0000000-0000-4000-8000-000000000001', 'en', 'Dining', 'dining'),
  ('e0000000-0000-4000-8000-000000000001', 'ja', 'グルメ', 'グルメ'),
  ('e0000000-0000-4000-8000-000000000001', 'ko', '다이닝', '다이닝'),
  ('e0000000-0000-4000-8000-000000000002', 'en', 'Activities', 'activities'),
  ('e0000000-0000-4000-8000-000000000011', 'en', 'Ramen', 'ramen'),
  ('e0000000-0000-4000-8000-000000000011', 'ja', 'ラーメン', 'ラーメン'),
  ('e0000000-0000-4000-8000-000000000011', 'ko', '라멘', '라멘'),
  ('e0000000-0000-4000-8000-000000000012', 'en', 'Sushi', 'sushi'),
  ('e0000000-0000-4000-8000-000000000012', 'ja', '寿司', '寿司'),
  ('e0000000-0000-4000-8000-000000000012', 'ko', '스시', '스시'),
  ('e0000000-0000-4000-8000-000000000013', 'en', 'Cafés & Coffee', 'cafes-coffee'),
  ('e0000000-0000-4000-8000-000000000013', 'ja', 'カフェ・コーヒー', 'カフェ'),
  ('e0000000-0000-4000-8000-000000000013', 'ko', '카페·커피', '카페'),
  ('e0000000-0000-4000-8000-000000000014', 'en', 'Izakaya', 'izakaya'),
  ('e0000000-0000-4000-8000-000000000014', 'ja', '居酒屋', '居酒屋'),
  ('e0000000-0000-4000-8000-000000000014', 'ko', '이자카야', '이자카야'),
  ('e0000000-0000-4000-8000-000000000021', 'en', 'Surf Lessons', 'surf-lessons')
on conflict (category_id, locale) do nothing;

-- ── Organizations / locations ────────────────────────────────────────────

insert into public.organizations (id, name, legal_name) values
  ('a0000000-0000-4000-8000-000000000001', 'Aloha Ramen Hale', 'Aloha Ramen Hale LLC'),
  ('a0000000-0000-4000-8000-000000000002', 'Waikiki Sushi Ten', 'Sushi Ten Hawaii Inc.'),
  ('a0000000-0000-4000-8000-000000000003', 'Kona Coffee Corner', 'KCC Ventures LLC')
on conflict (id) do nothing;

insert into public.locations
  (id, organization_id, address, geo_lat, geo_lng, phone) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   '{"street":"2250 Demo Ave Suite 101","city":"Honolulu","region":"HI","postal_code":"96815","country":"US"}',
   21.278320, -157.829444, '+1-808-555-0101'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   '{"street":"350 Fixture Lane","city":"Honolulu","region":"HI","postal_code":"96815","country":"US"}',
   21.279900, -157.826100, '+1-808-555-0102'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
   '{"street":"88 Sample St","city":"Honolulu","region":"HI","postal_code":"96815","country":"US"}',
   21.281500, -157.831200, '+1-808-555-0103')
on conflict (id) do nothing;

-- ── Hours (reference fixture exercises split + overnight + exception) ───

insert into public.hours_sets (id, location_id, weekly, last_order_offset_min, sells_out_early, unknown) values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   '{"mon":{"spans":[{"open":"11:00","close":"14:30"},{"open":"17:00","close":"22:00"}]},
     "tue":{"spans":[{"open":"11:00","close":"14:30"},{"open":"17:00","close":"22:00"}]},
     "wed":{"spans":[{"open":"11:00","close":"14:30"},{"open":"17:00","close":"22:00"}]},
     "thu":{"spans":[{"open":"11:00","close":"14:30"},{"open":"17:00","close":"22:00"}]},
     "fri":{"spans":[{"open":"18:00","close":"02:00"}]},
     "sat":{"spans":[{"open":"18:00","close":"02:00"}]},
     "sun":{"closed":true}}',
   30, true, false),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   '{"mon":{"spans":[{"open":"17:00","close":"23:00"}]},
     "tue":{"spans":[{"open":"17:00","close":"23:00"}]},
     "wed":{"closed":true},
     "thu":{"spans":[{"open":"17:00","close":"23:00"}]},
     "fri":{"spans":[{"open":"17:00","close":"23:30"}]},
     "sat":{"spans":[{"open":"17:00","close":"23:30"}]},
     "sun":{"spans":[{"open":"17:00","close":"22:00"}]}}',
   45, false, false),
  ('b1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
   '{}', null, false, true)
on conflict (location_id) do nothing;

insert into public.hours_exceptions (id, location_id, date, closed, reason, source) values
  ('b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   '2026-12-25', true, 'Christmas Day', 'vendor')
on conflict (location_id, date) do nothing;

-- ── Media (fixture rights evidence; manual-ingestion procedure documented) ─

insert into public.media (id, bucket, path, kind, rights, moderation_status, uploaded_by) values
  ('f0000000-0000-4000-8000-000000000001', 'public-photos', 'seed/aloha-ramen-1.webp', 'photo',
   '{"license":"vendor_agreement_v1","granted_by":"Aloha Ramen Hale LLC","agreement_ref":"SEED-AGR-001"}',
   'approved', '99000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002', 'public-photos', 'seed/aloha-ramen-2.webp', 'photo',
   '{"license":"vendor_agreement_v1","granted_by":"Aloha Ramen Hale LLC","agreement_ref":"SEED-AGR-001"}',
   'approved', '99000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000003', 'menu-sources', 'seed/aloha-ramen-menu.pdf', 'menu_source',
   '{"license":"vendor_supplied","granted_by":"Aloha Ramen Hale LLC","agreement_ref":"SEED-AGR-001"}',
   'approved', '99000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000004', 'evidence', 'seed/aloha-approval-en.pdf', 'evidence',
   '{"license":"approval_form_v1","granted_by":"Aloha Ramen Hale LLC","agreement_ref":"SEED-APPR-EN-001"}',
   'approved', '99000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000005', 'evidence', 'seed/aloha-approval-ja.pdf', 'evidence',
   '{"license":"approval_form_v1","granted_by":"Aloha Ramen Hale LLC","agreement_ref":"SEED-APPR-JA-001"}',
   'approved', '99000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000006', 'public-photos', 'seed/sushi-ten-1.webp', 'photo',
   '{"license":"vendor_agreement_v1","granted_by":"Sushi Ten Hawaii Inc.","agreement_ref":"SEED-AGR-002"}',
   'approved', '99000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000007', 'public-photos', 'seed/kona-coffee-1.webp', 'photo',
   '{"license":"vendor_agreement_v1","granted_by":"KCC Ventures LLC","agreement_ref":"SEED-AGR-003"}',
   'pending', '99000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.media_locales (media_id, locale, alt_text) values
  ('f0000000-0000-4000-8000-000000000001', 'en', 'Tonkotsu ramen bowl with chashu and ajitama'),
  ('f0000000-0000-4000-8000-000000000001', 'ja', 'チャーシューと味玉入り豚骨ラーメン'),
  ('f0000000-0000-4000-8000-000000000002', 'en', 'Counter seating at Aloha Ramen Hale'),
  ('f0000000-0000-4000-8000-000000000006', 'en', 'Omakase nigiri selection'),
  ('f0000000-0000-4000-8000-000000000006', 'ja', 'おまかせ握りの盛り合わせ')
on conflict (media_id, locale) do nothing;

-- ── Listings ─────────────────────────────────────────────────────────────
-- A: published EN+JA (reference fixture) · B: published EN+JA, no menu yet
-- ("menu coming soon" path) · C: draft with machine_draft JA (leakage tests).

insert into public.listings (id, location_id, publication_status, price_band) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'published', '$$'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'published', '$$$'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'draft', '$')
on conflict (id) do nothing;

insert into public.listing_categories (listing_id, category_id) values
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000011'),
  ('c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000014'),
  ('c0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000012'),
  ('c0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000013')
on conflict (listing_id, category_id) do nothing;

update public.listings set primary_category_id = 'e0000000-0000-4000-8000-000000000011'
where id = 'c0000000-0000-4000-8000-000000000001' and primary_category_id is null;
update public.listings set primary_category_id = 'e0000000-0000-4000-8000-000000000012'
where id = 'c0000000-0000-4000-8000-000000000002' and primary_category_id is null;
update public.listings set primary_category_id = 'e0000000-0000-4000-8000-000000000013'
where id = 'c0000000-0000-4000-8000-000000000003' and primary_category_id is null;

insert into public.listing_media (listing_id, media_id, position) values
  ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 0),
  ('c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 1),
  ('c0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000006', 0),
  ('c0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000007', 0)
on conflict (listing_id, media_id) do nothing;

insert into public.listing_locales
  (id, listing_id, locale, status, name, slug, seo_title, seo_desc, editorial_note) values
  -- A — the reference fixture
  ('d0000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000001', 'en',
   'published', 'Aloha Ramen Hale', 'aloha-ramen-hale',
   'Aloha Ramen Hale — Tonkotsu Ramen in Waikīkī',
   'Locals-verified tonkotsu ramen shop steps from the beach. Late-night bowls Friday and Saturday.',
   'A tiny counter shop the kitchen crew swears by after close.'),
  ('d0000000-0000-4000-8000-000000000102', 'c0000000-0000-4000-8000-000000000001', 'ja',
   'published', 'アロハ・ラーメン・ハレ', 'アロハラーメンハレ',
   'アロハ・ラーメン・ハレ｜ワイキキの豚骨ラーメン',
   'ビーチから徒歩すぐ、地元公認の豚骨ラーメン店。金土は深夜営業。',
   null),
  ('d0000000-0000-4000-8000-000000000103', 'c0000000-0000-4000-8000-000000000001', 'ko',
   'qa_pending', '알로하 라멘 할레', null, null, null, null),
  -- B — published EN+JA, menu coming soon
  ('d0000000-0000-4000-8000-000000000201', 'c0000000-0000-4000-8000-000000000002', 'en',
   'published', 'Waikiki Sushi Ten', 'waikiki-sushi-ten',
   'Waikiki Sushi Ten — Omakase Counter',
   'Ten-seat omakase counter run by a Tsukiji-trained chef.', null),
  ('d0000000-0000-4000-8000-000000000202', 'c0000000-0000-4000-8000-000000000002', 'ja',
   'published', 'ワイキキ 寿司天', 'ワイキキ寿司天',
   'ワイキキ 寿司天｜おまかせカウンター',
   '築地で修業した大将が握る10席のおまかせカウンター。', null),
  ('d0000000-0000-4000-8000-000000000203', 'c0000000-0000-4000-8000-000000000002', 'ko',
   'not_started', null, null, null, null, null),
  -- C — draft; JA machine_draft text must NEVER leak publicly
  ('d0000000-0000-4000-8000-000000000301', 'c0000000-0000-4000-8000-000000000003', 'en',
   'qa_approved', 'Kona Coffee Corner', 'kona-coffee-corner',
   'Kona Coffee Corner', 'Single-origin Kona pour-overs and malasadas.', null),
  ('d0000000-0000-4000-8000-000000000302', 'c0000000-0000-4000-8000-000000000003', 'ja',
   'machine_draft', 'コナ・コーヒー・コーナー（機械翻訳ドラフト）', null, null,
   'MACHINE_DRAFT_TEXT_MUST_NOT_RENDER', null)
on conflict (listing_id, locale) do nothing;

-- Romanized alias for the JA native-script slug (PRD 6.12; in-page 301)
insert into public.slug_aliases (id, route_scope, locale, alias_slug, target_id) values
  ('d9000000-0000-4000-8000-000000000001', 'listing', 'ja', 'aloha-ramen-hale',
   'c0000000-0000-4000-8000-000000000001')
on conflict (route_scope, locale, alias_slug) do nothing;

-- ── Menu for listing A (published EN/JA with evidence; KO pending) ───────

insert into public.menu_documents (id, listing_id, source_media_id, captured_at, captured_by) values
  ('90000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000003', '2026-06-15T10:00:00Z',
   '99000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.menu_versions (id, menu_document_id, version, status) values
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 1, 'active')
on conflict (menu_document_id, version) do nothing;

insert into public.menu_version_locales
  (id, menu_version_id, locale, status, approval_type,
   approval_evidence_media_id, approved_by, approved_at) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'en',
   'published', 'vendor_approved_external',
   'f0000000-0000-4000-8000-000000000004', '99000000-0000-4000-8000-000000000002',
   '2026-06-20T18:30:00Z'),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'ja',
   'published', 'vendor_approved_external',
   'f0000000-0000-4000-8000-000000000005', '99000000-0000-4000-8000-000000000002',
   '2026-06-21T09:15:00Z'),
  ('92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'ko',
   'translation_pending', null, null, null, null)
on conflict (menu_version_id, locale) do nothing;

insert into public.menu_sections (id, menu_version_id, position) values
  ('93000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 0),
  ('93000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 1)
on conflict (id) do nothing;

insert into public.menu_section_locales (section_id, locale, name) values
  ('93000000-0000-4000-8000-000000000001', 'en', 'Ramen'),
  ('93000000-0000-4000-8000-000000000001', 'ja', 'ラーメン'),
  ('93000000-0000-4000-8000-000000000001', 'ko', '라멘'),
  ('93000000-0000-4000-8000-000000000002', 'en', 'Sides'),
  ('93000000-0000-4000-8000-000000000002', 'ja', 'サイドメニュー'),
  ('93000000-0000-4000-8000-000000000002', 'ko', '사이드 메뉴')
on conflict (section_id, locale) do nothing;

insert into public.menu_items
  (id, section_id, position, price_cents, currency, price_type, owner_pick) values
  ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 0, 1650, 'USD', 'fixed', true),
  ('94000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001', 1, 1750, 'USD', 'fixed', false),
  ('94000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000002', 0, 650, 'USD', 'fixed', false),
  ('94000000-0000-4000-8000-000000000004', '93000000-0000-4000-8000-000000000002', 1, null, 'USD', 'market', false)
on conflict (id) do nothing;

insert into public.menu_item_locales
  (item_id, locale, original_name, name, description, extraction_confidence, human_confirmed) values
  ('94000000-0000-4000-8000-000000000001', 'en', 'Tonkotsu Ramen', 'Tonkotsu Ramen',
   'Rich 18-hour pork-bone broth, chashu, ajitama, wood-ear mushroom.', 0.98, true),
  ('94000000-0000-4000-8000-000000000001', 'ja', 'Tonkotsu Ramen', '豚骨ラーメン',
   '18時間炊いた濃厚豚骨スープ。チャーシュー・味玉・きくらげ入り。', 0.97, true),
  ('94000000-0000-4000-8000-000000000001', 'ko', 'Tonkotsu Ramen', '돈코츠 라멘',
   '18시간 우려낸 진한 돼지뼈 육수, 차슈, 아지타마, 목이버섯.', 0.95, true),
  ('94000000-0000-4000-8000-000000000002', 'en', 'Spicy Miso Ramen', 'Spicy Miso Ramen',
   'House miso blend with chili oil and ground pork.', 0.96, true),
  ('94000000-0000-4000-8000-000000000002', 'ja', 'Spicy Miso Ramen', '辛味噌ラーメン',
   '自家製味噌にラー油と挽き肉を合わせた一杯。', 0.96, true),
  ('94000000-0000-4000-8000-000000000002', 'ko', 'Spicy Miso Ramen', '매운 미소 라멘',
   '수제 미소에 고추기름과 다진 돼지고기를 더했습니다.', 0.72, false),
  ('94000000-0000-4000-8000-000000000003', 'en', 'Gyoza (5 pc)', 'Gyoza (5 pc)',
   'Pan-fried pork gyoza.', 0.99, true),
  ('94000000-0000-4000-8000-000000000003', 'ja', 'Gyoza (5 pc)', '餃子（5個）',
   'パリッと焼いた豚肉餃子。', 0.99, true),
  ('94000000-0000-4000-8000-000000000004', 'en', 'Catch of the Day Poke', 'Catch of the Day Poke',
   'Market price — ask your server.', 0.90, true),
  ('94000000-0000-4000-8000-000000000004', 'ja', 'Catch of the Day Poke', '本日のポケ',
   '時価。スタッフにお尋ねください。', 0.90, true)
on conflict (item_id, locale) do nothing;

-- ── Provenance (required set for the publish gate) ───────────────────────

insert into public.provenance
  (target_table, target_id, field, supplied_by, source_type, verified_by, approval_status, expires_at, is_current)
values
  ('listings',  'c0000000-0000-4000-8000-000000000001', 'name',
   'vendor', 'onboarding_form', '99000000-0000-4000-8000-000000000002', 'approved', '2027-07-10T00:00:00Z', true),
  ('locations', 'b0000000-0000-4000-8000-000000000001', 'address',
   'vendor', 'onboarding_form', '99000000-0000-4000-8000-000000000002', 'approved', '2027-07-10T00:00:00Z', true),
  ('locations', 'b0000000-0000-4000-8000-000000000001', 'hours',
   'vendor', 'hours_confirmation', '99000000-0000-4000-8000-000000000002', 'approved', '2026-10-10T00:00:00Z', true),
  ('listings',  'c0000000-0000-4000-8000-000000000002', 'name',
   'vendor', 'onboarding_form', '99000000-0000-4000-8000-000000000002', 'approved', '2027-07-10T00:00:00Z', true),
  ('locations', 'b0000000-0000-4000-8000-000000000002', 'address',
   'editor', 'in_person_visit', '99000000-0000-4000-8000-000000000002', 'approved', '2027-07-10T00:00:00Z', true),
  ('locations', 'b0000000-0000-4000-8000-000000000002', 'hours',
   'vendor', 'hours_confirmation', '99000000-0000-4000-8000-000000000002', 'approved', '2026-10-10T00:00:00Z', true)
on conflict (target_table, target_id, field) where is_current do nothing;
