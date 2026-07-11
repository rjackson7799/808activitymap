# 808 Portal — Technical Solution Design (TSD v1.0)

*July 2026 · Derived from `808_portal_PRD_v2_FINAL.md` (authoritative for product behavior). This TSD makes no product decisions; anything behavioral traces to a PRD section or decision ID. Brand name/domain are placeholders per D27 (`BRAND_NAME`, `PORTAL_DOMAIN` env config).*

---

## 1. Stack decisions

| Concern | Decision | Rationale / alternative |
|---|---|---|
| Framework | **Next.js 14+ (App Router), single monorepo app** serving public site + vendor portal + admin via route groups | First-class SSG/ISR + on-demand revalidation (§20 PRD caching reqs); one framework for all three surfaces suits a solo builder; React/TS/Tailwind/shadcn skills carry over. Astro was viable for public-only but adds a second stack. |
| Hosting | **Vercel** (ISR + cron + edge) | Netlify acceptable fallback (supports Next ISR); Vercel's on-demand revalidation + cron is smoother. Existing 808eventures.com stays on Netlify untouched. |
| DB / Auth / Storage | **Supabase** (Postgres 15, Auth, Storage, RLS) | Already in Ryan's stack. RLS carries the §4 permission matrix. |
| Payments | **Stripe** (existing 808eVentures account; dedicated Product/Price catalog per D26/§25) | Checkout Sessions + Billing customer portal + signed webhooks. |
| AI | **Anthropic Claude API** — vision extraction (menus), translation (EN↔JA↔KO) | Structured-output prompting; per-job cost logged (P0-11). |
| Email/SMS | **Resend** (email) + **Twilio** (SMS, assisted-inbox replies only, D11) | Templates versioned in repo; all sends logged. |
| Analytics | **Dual-write:** first-party `events` table in Postgres (source of truth for vendor reports) + **PostHog Cloud** (cookieless mode) for product analytics | Satisfies D19 (first-party, cookieless-capable, consent classes) and P0-12 server-side capture for critical events. Vendor-report numbers are always computed from our own DB, never a third-party dashboard. |
| Jobs | **Postgres job queue table + Vercel Cron worker** (1-min tick), 3 retries, dead-letter status, alert email (D24) | No extra infra at pilot scale; swap to Inngest later if volume demands. |
| Monitoring | Sentry (errors) + Vercel analytics (CWV field data) + UptimeRobot | Minimal, sufficient for pilot. |

## 2. System context

```
Visitors (EN/JA/KO) ──HTTPS──▶ Next.js (Vercel)
                                 ├─ Public site (SSG/ISR)  ──reads──▶ Supabase Postgres
                                 ├─ Vendor portal (SSR)    ──RLS────▶       │
                                 ├─ Admin (SSR)            ──RLS────▶       │
                                 └─ API routes ────────────────────▶ job_queue, events
Stripe ──webhooks──▶ /api/webhooks/stripe ──▶ subscriptions ──▶ entitlements (computed)
Claude API ◀── extraction/translation jobs ◀── cron worker ◀── job_queue
Resend/Twilio ◀── notification jobs
AI/search crawlers ──▶ public pages + llms.txt + sitemaps (JS-free content)
```

## 3. Repository layout

```
/app
  /(public)/[locale?]/...        # EN at root, /ja, /ko (D3) — SSG/ISR
  /(vendor)/portal/...           # Phase 1, SSR, auth required
  /(admin)/admin/...             # SSR, privileged roles, MFA
  /api/...                       # route handlers (below)
/lib        domain logic (entitlements, open-now, state machines, slugs, referrer-class)
/db         supabase migrations (SQL, forward-only), seed, RLS policies, tests
/jobs       job handlers (extract, translate, notify, reconcile, sitemap, linkcheck)
/emails     Resend templates (versioned, per-locale)
/config     runtime config loader (see §23)
/tests      unit / integration(RLS) / e2e(Playwright) / fixtures(schema.org)
```

## 4. Data model (ERD → tables)

Conventions: `id uuid pk default gen_random_uuid()`, `created_at/updated_at timestamptz`, soft-delete only where stated, `market_id text not null default 'oahu-waikiki'` on all content tables. FKs `on delete restrict` unless noted.

**organizations** (BusinessOrganization): `name, legal_name, notes, status`
**locations** (BusinessLocation): `organization_id fk, address, geo point, phone, operational_status enum(active|temporarily_closed|permanently_closed|suspended|disputed), timezone default 'Pacific/Honolulu'`
**listings**: `location_id fk unique, publication_status enum(draft|review_pending|published|unpublished|archived), plan_tier_cache text, primary_category_id fk, price_band, attributes jsonb, market_id`
**listing_locales**: `listing_id fk, locale enum(en|ja|ko), status enum(not_started|machine_draft|qa_pending|qa_approved|vendor_review_pending|vendor_approved|published|stale|withdrawn), name, slug, seo_title, seo_desc, editorial_note, unique(listing_id, locale), unique(locale, slug)`
**hours_sets**: `location_id fk, weekly jsonb (per-day spans incl. overnight), last_order_offset_min, kitchen_note, sells_out_early bool, appointment_only bool, unknown bool` · **hours_exceptions**: `location_id fk, date, spans jsonb|closed bool, reason, source` (P1-4)
**categories**: `parent_id fk null, market_id, sort, active bool, publicly_visible bool (D4)` · **category_locales**: `category_id fk, locale, label, slug, unique(locale, slug)` · **listing_categories**: `listing_id, category_id, is_primary` (max subcats via config)
**menu_documents**: `listing_id fk, source_media_id fk, captured_at, captured_by` → **menu_versions**: `menu_document_id fk, version int, status enum(draft|active|superseded)` → **menu_version_locales**: `menu_version_id fk, locale, status enum(translation_pending|qa_pending|qa_approved|vendor_approval_pending|approved|published|superseded|rejected), approval_type enum(portal|vendor_approved_external) (D1), approval_evidence_media_id fk null, approved_by, approved_at` → **menu_sections** → **menu_items**: `section_id fk, position, price_cents int null, currency default 'USD', price_type enum(fixed|market|from), variant, flags jsonb, owner_pick bool` · **menu_item_locales**: `item_id, locale, original_name, transliteration, name, description, extraction_confidence numeric, human_confirmed bool` (price/allergen QA-block rule enforced in workflow, §6 PRD)
**deals**: `listing_id fk, status enum(requested|approved|active|expired|killed), starts_at, expires_at not null, sponsor_label bool, reveal_count int` · **deal_locales**: `deal_id, locale, title, terms, status(...)`
**claims**: `location_id fk, organization_id fk null, claimant_user_id, method enum(phone_callback|document|postcard|in_person), evidence_media_id, status enum(claim_pending|verified_claimed|disputed|revoked|rejected), decided_by, decided_at`
**organization_memberships**: `organization_id, user_id, role enum(vendor_owner|vendor_manager), billing_admin bool, invited_by, status` (D8/D9)
**subscriptions**: `organization_id fk, stripe_customer_id, stripe_subscription_id, portal_state enum(none|checkout_pending|incomplete|active|cancellation_scheduled|past_due|grace|unpaid|canceled|refunded|disputed_chargeback|downgraded_free), term_start, term_end, price_id, grace_until` — Stripe is upstream truth (§13 PRD)
**entitlements** (computed, cached): `organization_id, key enum(badge|translated_menus|analytics|report|deals|priority|team_seats), granted bool, computed_at` — recomputed on every subscription change + daily reconcile; **never read plan from listings**
**change_requests** (P0-7): `target_table, target_id, base_version int, diff jsonb, proposer_user_id, proposer_channel enum(portal|assisted_email|assisted_sms|contributor), evidence_media_id null, status enum(open|merged|rejected|overridden), resolved_by, resolution_note`
**observed_statuses** (D16): `location_id, kind enum(closed_sign|line_length|hours_conflict|other), value jsonb, observed_at, contributor_user_id, disclosure text, gps point null, status enum(new|accepted_as_exception|dismissed)`
**moderation_cases**: `kind enum(flag|photo|closure_report|dispute|observed_conflict), target refs, reporter, status, sla_due_at, assignee`
**provenance**: `target_table, target_id, field, supplied_by enum(vendor|contributor|editor|ops_on_behalf|migration_first_party), source_type, verified_at, verified_by, confidence, approval_status, expires_at` (P0-10; `import` value does not exist)
**work_sessions** (D18): `user_id, work_type enum(extraction_review|qa_ja|qa_ko|vendor_approval|moderation|editorial|ops_change), target refs, started_at, paused_ms, completed_at, active_minutes generated` · **workflow_transitions**: `target refs, from_state, to_state, actor, at` (elapsed-time source)
**ai_jobs_log**: `job_id, kind enum(extract|translate), model, input_tokens, output_tokens, cost_usd, items_count, pages_count` (P0-11)
**media**: `bucket, path, kind enum(photo|menu_source|evidence|report), rights jsonb (license, granted_by, agreement_ref) (D17), moderation_status, uploaded_by` — evidence bucket private + signed URLs only
**events** (first-party analytics): `name, ts, session_id, locale, market_id, listing_id null, vendor_org_id null, props jsonb, source enum(client|server), consent_class, referrer_class enum(organic|ai|social|direct|influencer|qr|unknown)` — partitioned monthly; §16 PRD dictionary is the contract
**notifications_log**: `template, recipient, channel, locale, status, provider_id, triggered_by` · **assisted_messages**: `channel, from_address, body, media, matched_org_id null, linked_change_request_id null` (D11 evidence)
**job_queue**: `kind, payload jsonb, status enum(pending|running|done|failed|dead), attempts int, run_after, last_error` · **audit_log**: `actor, action, target, before jsonb, after jsonb, at` (append-only)
**app_config** (§23): `key unique, value jsonb, description, updated_by`

## 5. Locale publication model (P0-5 implementation)

A locale page **exists** iff: `listing.publication_status = published` AND `listing_locales.status ∈ {qa_approved, vendor_approved, published}` AND minimum field set present (name, address ref, hours known-or-flagged, primary category, ≥1 approved photo). Menus render in a locale iff `menu_version_locales.status ∈ {approved, published}` for that locale (money-term rule, §6 PRD). Implementation: a SQL view `publishable_locale_pages(listing_id, locale)` is the single source consumed by (a) `generateStaticParams`, (b) sitemaps, (c) the revalidation hook. Identity-field EN fallback (PRD §11) is resolved in the view, never in components. `stale` is set by the freshness cron when a required field's provenance passes its threshold → badge auto-suspends (D15) and page renders amber verified-chip; page is not unpublished.

## 6. AuthN / AuthZ / RLS

- Supabase Auth: email+password and magic link; email verification required. Privileged roles (`super_admin`,`publisher`,`editor`) require TOTP MFA (enforced at middleware: no admin route without `aal2`).
- Roles stored in `user_roles(user_id, role)` (platform roles) and `organization_memberships` (vendor side). JWT custom claims carry platform roles; vendor scope resolved per-row.
- **RLS pattern:** every table gets policies generated from the §4 PRD matrix. Helper functions: `is_platform(role text[])`, `is_org_member(org_id, min_role)`, `owns_target(target)`. Writes for vendors/ops on protected fields are **denied at RLS**; the only write path is inserting a `change_request` (P0-7). Direct-publish exceptions per D10 (hours-confirm ack, owner_pick flag) are explicit column-level policies.
- **RLS test suite (PRD §19):** `/tests/rls/matrix.test.sql` iterates role × table × action and asserts allow/deny — the matrix in code mirrors PRD §4 1:1; CI fails on drift.
- Admin session: 12h max, 30-min idle timeout; all privileged mutations require recent auth (Supabase `aal` check).

## 7. Route map

**Public (SSG/ISR):** per PRD §7 exactly; EN at root (D3). Dynamic segments: `[categorySlug]`, `[listingSlug]` resolved per-locale against `*_locales.slug`; romanized alias table 301s to canonical native-script slug (PRD 6.12); slug change writes a `redirects` row consumed by middleware.
**Vendor portal (Phase 1):** `/portal` (dashboard) · `/portal/claim` (+search, +verify, +status) · `/portal/profile` · `/portal/hours` · `/portal/menu` (+upload, +review/approve) · `/portal/photos` · `/portal/deals` · `/portal/team` · `/portal/billing` · `/portal/reports`.
**Admin:** `/admin` (queues home) · `/admin/listings[/:id]` · `/admin/claims` · `/admin/qa/ja`, `/admin/qa/ko` · `/admin/approvals` (external-evidence recording, D1) · `/admin/moderation` · `/admin/change-requests` (diff/merge UI, P0-7) · `/admin/deals` · `/admin/taxonomy` · `/admin/freshness` · `/admin/billing-exceptions` · `/admin/users` · `/admin/audit` · `/admin/config`.
Each admin/vendor screen implements: role guard, empty state, error state, and its analytics event (PRD P1-2 contract; enumerated per-screen in `/docs/screens.md` scaffold).

## 8. API contracts (route handlers)

| Endpoint | Method/auth | Behavior |
|---|---|---|
| `/api/out/:dealOrPartnerLinkId` | GET, public | **Server-side redirect** for affiliate clickout: write `events(affiliate_clickout)` + 302 to partner URL with params (§16 PRD). |
| `/api/deals/:id/reveal` | POST, public, rate-limited | Server-validates deal `active` + not expired; dedupes per `session_id`; increments counter; returns code. Expired → 410 + alternatives payload (companion E2.1). |
| `/api/events` | POST, public, rate-limited | Client event ingestion → `events` (+ PostHog forward). Bot filter (UA + heuristics) before insert; consent class attached. |
| `/api/webhooks/stripe` | POST, Stripe signature | §12 below. Idempotent by `event.id` (processed-events table). |
| `/api/revalidate` | POST, internal token | On-demand ISR revalidation by tag (`listing:{id}:{locale}`, `category:{id}:{locale}`, `deals`, `today`). Emergency path (kill/closure/legal) also purges Vercel cache — target ≤60s (PRD §19). |
| `/api/uploads/sign` | POST, authed | Signed upload URL; validates type/size; virus scan job enqueued; evidence bucket = private. |
| `/api/claims` | POST, authed vendor | Create claim + evidence ref; transitions per §6 PRD. |
| `/api/change-requests` | POST, authed (vendor/ops/contributor) | Insert CR with `base_version`; conflict detection = compare base_version to current on merge (P0-7). |
| `/api/jobs/tick` | POST, cron secret | Worker: claim due jobs (`FOR UPDATE SKIP LOCKED`), run, retry/backoff (1m/10m/1h), → `dead` + alert email after 3 (D24). |
| `/api/reports/:orgId/:month` | GET, entitled vendor | Renders report from `events` aggregates in vendor-selected locale (D22) incl. AI-referral methodology note (D21). |

## 9. Async jobs

`extract_menu` (Claude vision → sections/items JSON + confidence; writes ai_jobs_log) · `translate_locale` (per target locale; money fields flagged for QA block) · `send_notification` (template+locale from §17 PRD matrix; timings from app_config) · `stripe_reconcile` (daily: Stripe list subs ↔ portal_state diff → flag `/admin/billing-exceptions`) · `freshness_scan` (daily: provenance expiry → stale flags, badge suspension, freshness queue) · `sitemap_build` (on publish events, debounced) · `affiliate_linkcheck` (weekly; dead → auto-hide, companion E7.1) · `deal_expire` (minutely: expire + revalidate) · `report_generate` (monthly per config day) · `backup_verify` (quarterly restore-test reminder task, D24).

## 10. Menu extraction & translation pipeline

1. Upload → `menu_documents` + `extract_menu` job. 2. Claude vision prompt returns strict JSON (sections/items/prices/confidence per field); items with `price` or allergen-adjacent text below `extraction_confidence_threshold` (config) get `human_confirmed=false` and **block QA transition** (PRD §6). 3. `translate_locale` jobs per locale → `machine_draft`. 4. Reviewer works in `/admin/qa/{locale}` with WorkSession timer (start/pause/complete — D18) and source-image side-by-side. 5. Vendor approval: portal flow (Phase 1) or `vendor_approved_external` recorded by editor/ops with uploaded signed form (D1). 6. Publish → prior version `superseded` (never deleted); revalidate tags. Rollback = re-activate prior version (admin action, audited). Prompts are versioned files in `/jobs/prompts/`; model + prompt version stored on `ai_jobs_log` for reproducibility.

## 11. Stripe design (§13 PRD)

- Catalog: dedicated Products/Prices in the existing account, metadata `app=portal` (D26 segmentation); founding plan = 6-month term (D13) implemented as monthly price + `cancel_at` set to term_end, price locked via subscription schedule.
- Checkout Session (org-scoped, `client_reference_id=org_id`); customer portal for card update/cancel.
- Webhooks → portal_state mapping: `checkout.session.completed→active` · `invoice.payment_failed→past_due` (start dunning) · dunning day 0/3/7 (config) then `grace_until=now()+14d`, state `grace` · grace lapse → `unpaid` → entitlement recompute → `downgraded_free` per D12 table · `customer.subscription.updated(cancel_at_period_end)→cancellation_scheduled` · `charge.dispute.created→disputed_chargeback` (entitlements suspend, content untouched) · refunds per table.
- **Entitlements = pure function** `computeEntitlements(portal_state)` in `/lib/entitlements.ts` implementing PRD §13 table verbatim; unit-tested cell-by-cell; results cached to `entitlements` and enforced server-side (never UI-only).
- Daily `stripe_reconcile` job; two consecutive clean weeks = Phase-1 criterion (PRD §20).

## 12. Media

Buckets: `public-photos` (moderated; served via Vercel Image Optimization, AVIF/WebP, responsive) · `menu-sources` (private; QA + public "source image" link via short-lived signed URL) · `evidence` (private, editor+ only, signed URLs, encrypted at rest; 24-month purge job per PRD §19). Upload validation: MIME sniff, size caps, image re-encode (strips EXIF GPS), scan job. Every media row carries rights metadata (D17).

## 13. Analytics implementation (§16 PRD)

- Event dictionary lives in `/lib/analytics/dictionary.ts` — one typed object per event (name, trigger, source, props schema, dedupe, consent_class, retention, report usage, test ref). CI validates emitted events against it.
- Server-captured: `listing_view` (in page render, ad-blocker-proof), `affiliate_clickout` (redirect endpoint), `deal_reveal` (reveal endpoint). Client: viewport/tap events via `/api/events`.
- `referrer_class`: versioned classification table in `app_config` (UA + referrer patterns; `ai` = known assistant/AI-search signatures; default `unknown` always present — D21). Vendor reports compute from `events` SQL only.
- Consent: cookieless anonymous `session_id` (localStorage-free option: server-set 30-min rolling hash) — final consent-banner posture confirmed with provider setup (D19); no precise location ever collected.

## 14. Notifications

Implementation of PRD §17 matrix: `notification_templates` in repo (Resend/Twilio), per-locale variants; all timings read from `app_config` (single source shared with checkout copy + agreement text constants — companion Risk 5). Every send → `notifications_log`. Assisted inbox: shared address + Twilio number → `assisted_messages` → ops links to CR (evidence, D11).

## 15. Caching & invalidation (P1-9)

SSG at build for stable pages; ISR with tag-based on-demand revalidation on every publish/approve/expire event (tags in §8). Emergency invalidation path (killed deal, closure, takedown): revalidate + cache purge, alert if >60s. No service worker (PRD §19). `stale-while-revalidate` headers on category pages.

## 16. SEO/GEO implementation (§15 PRD)

- **Schema mapping (fixture-tested):** Listing→`Restaurant` (name per-locale, address, geo, telephone, `openingHoursSpecification` incl. exceptions via validity ranges, priceRange, servesCuisine←primary category, image, url per-locale) · MenuVersion→`Menu`/`hasMenuSection`/`MenuItem` (name, description, `offers.price` — omit for `market` price_type) · Deal→`Offer` (validFrom/Through) · Category page→`ItemList`+`BreadcrumbList` · sameAs links when vendor provides.
- Validation fixtures: golden JSON-LD files per template in `/tests/fixtures/schema/`; CI diff + Rich Results test in release checklist (Phase-0 criterion).
- `llms.txt` generated from template (blocked on D27 name; placeholder in staging). robots.txt allowlist per PRD §15, reviewed quarterly (config).
- Sitemaps per language incl. category + listing URLs from the §5 view; hreflang triplets + x-default=EN emitted by shared head component.
- Slugs: NFC-normalize, percent-encode, collision→`-2` suffix, romanized alias table with 301 (PRD 6.12).

## 17. Security & privacy design

Server-side authz on every mutation (RLS + handler checks); MFA for privileged roles; Stripe signature verification + idempotency; upload validation per §12; secrets in Vercel/Supabase env (never repo); audit_log append-only (no update/delete grants); rate limits (middleware, per-IP+session) on reveal/events/claims/report-change; security events (failed logins, role grants, exports) logged; claim evidence access restricted `editor+` and every access audited; retention jobs: evidence 24mo, abuse/IP 90d (PRD §19); account deletion = anonymize user + retain audit stubs.

## 18. Backup & recovery (D24)

Supabase PITR/daily backups (verify plan tier includes PITR); storage bucket replication via scheduled export; quarterly restore test into staging with checklist + sign-off task; RPO 24h / RTO 12h documented runbook `/docs/runbooks/restore.md`; deploy rollback = Vercel instant rollback + forward-only migrations (destructive changes gated behind two-step expand/contract pattern).

## 19. Environments & CI/CD

`local` (supabase CLI + seed fixtures incl. 3 trilingual demo listings) → `staging` (own Supabase project, Stripe test mode, noindex) → `production`. GitHub Actions: typecheck, lint, unit, RLS matrix tests, schema-fixture validation, Lighthouse CI (throttled per PRD §19 budget: Moto-G profile, 1.6Mbps/150ms, reference fixture), Playwright E2E on staging, then promote. Migrations applied via CI only; seeds never run in prod.

## 20. Test strategy

- **Unit:** entitlements table (every cell), open-now engine (split/overnight/24h/last-order/exceptions/sells-out/unknown — P1-4 cases as table-driven tests), state-machine transition guards, slug pipeline, referrer classifier.
- **Integration:** RLS role×table×action matrix (§6 above); Stripe webhook flows against stripe-mock incl. dunning→grace→downgrade; CR conflict detection (stale base_version).
- **E2E (Playwright):** J1 (JA visitor → ramen → menu → directions), J2 (deal reveal + expiry), J3 (claim→pay→menu approval, Phase 1), language-switch persistence (companion E1.1), 410 closed-listing flow.
- **Fixtures:** schema.org goldens; performance reference listing; trilingual seed content.
- **Quality gates map to PRD §20 phase criteria**; a `checklist.md` per phase is the release artifact.

## 21. Rollout by slice (PRD §21) & rollback

Feature flags (`app_config`) gate each slice surface. Slice order per PRD; slice ships when its PRD criteria + this TSD's tests pass. Public visibility of anything vendor/billing-related stays flagged off until Phase-1 gate. Rollback: flag-off first, deploy-rollback second, data migrations expand/contract so rollback never loses data. Slice-2 (KO) starts only after ≥3 real menus complete the pipeline with measured throughput (D2).

## 22. Cost & capacity notes (pilot scale)

40 listings × ~60 menu items × 3 locales ≈ 7.2k localized items — trivial for Postgres. Claude extraction ≈ 1–3 images/menu; translation ≈ 10–30k tokens/menu/locale; log actuals to `ai_jobs_log` (feeds Gate-2 cost model). PostHog free tier + Supabase Pro + Vercel Pro ≈ within the pro-forma's tool budget. ISR keeps DB read load near-zero for public traffic.

## 23. Configuration registry

Every PRD §22 value = row in `app_config`, loaded via `/config` with Zod schema + defaults; admin-editable at `/admin/config` (audited): staleness thresholds per field type · extraction confidence threshold · max subcategories · grace days · dunning schedule · price-hold window · reminder cadences · moderation thresholds · deal behavior · locale availability per market · plan entitlements map · badge freshness rules · report day · affiliate ordering · queue SLAs · referrer-classification table · robots allowlist.

## 24. Open technical items (tracked, non-blocking)

1. Supabase plan tier vs PITR requirement — confirm before prod. 2. PostHog consent-banner posture for EU visitors (D19 finalization). 3. Twilio A2P registration lead time for the assisted-SMS number. 4. Vercel vs Netlify final call if org standardizes on Netlify. 5. `BRAND_NAME`/`PORTAL_DOMAIN` swap sweep on D27 (llms.txt, emails, agreements constants, Stripe product names).

---
*Build entry point: Slice 1 = migrations for §4 core tables + RLS + taxonomy admin + public EN/JA listing/category pages + schema fixtures + analytics foundation.*
