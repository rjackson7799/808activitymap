# 808 Portal — Final PRD (v2.0 · Build-Ready)

*Working title: "Waikiki Dining Portal" describes the **Phase 0/1 beachhead**, not the product's boundary. The platform is architected for expansion beyond dining (Activities hierarchy modeled from day one, §14/D4) and beyond Waikiki (`market_id` on all entities). Final brand name TBD — see D27.*

*July 2026 · Status: **Approved for TSD, UX design, and development.***
*Supersedes `808_portal_PRD_v1.md`. Incorporates `808_portal_PRD_companion_journeys_edge_cases.md` by reference (journeys J1–J8, personas, error catalog remain valid **except as amended in §23**). Resolves all Priority-0 items and Decisions D1–D27 from the July 2026 PRD readiness review + product-owner decisions.*

---

## 1. Product overview

**One-line:** Help visitors — in English, Japanese, and Korean — confidently choose where to eat in Waikiki, via verified, translated listings and menus.

**Positioning:** The multilingual, locals-verified, machine-readable source of truth for Waikiki dining — the source both humans and AI assistants trust and cite.

**Build standard:** Best-in-class at small scale: 25–40 listings that are more accurate, more current, and more trilingual than anything on Google/Yelp/TripAdvisor.

**Goals (Phase 0 + 1):** (1) a trilingual consumer site visitors use mid-trip; (2) 8–10 paying founding vendors on a measurable value proposition; (3) full instrumentation from day one; (4) all listing data published search- and AI-readable; (5) the trilingual content workflow proven at a *measured* cost per listing/menu.

**Non-goals (backlog, §24):** itinerary chat · live conditions · locals/visitors scoring · first-party reviews · booking engine · native apps · consumer accounts/saves · multi-city admin · public JSON feed · languages beyond EN/JA/KO.

---

## 2. Decision log (binding)

| ID | Decision | Resolution |
|---|---|---|
| D1 | Menu approval for unclaimed Phase 0 listings | **Off-platform written approval** (signed/e-signed content-permission form incl. menu sign-off), stored as evidence; menu state `vendor_approved_external{evidence, actor, date}`. Formal portal claim follows in Phase 1. |
| D2 | Korean scope | **EN/JA/KO at launch (owner decision, reaffirmed)** with safeguards: KO reviewer contracted + throughput tested on ≥3 real menus + named backup **before** content production; 100% trilingual for founding (paying) vendors; seeded non-paying listings ≥70% KO menu coverage at launch, 100% within 30 days. KO queue capacity/SLA tracked in admin. |
| D3 | English URL convention | **Root routes, no `/en/`** (`/waikiki/ramen/`); `/ja/…`, `/ko/…` prefixed; applied consistently incl. hreflang/canonicals. |
| D4 | Activities taxonomy | Modeled from day one, **hidden from public UI/sitemaps in Phase 0** (affiliate modules don't require public taxonomy). |
| D5 | `/today/` editorial | **Kept.** Owner: Ryan. Cadence: weekly, EN/JA/KO. Hypothesis: fresh editorial drives repeat use (`today_note_view` + return-session rate reviewed at Gate 2; cut if flat). |
| D6 | Consumer accounts/saves | **None in Phase 0/1.** |
| D7 | `save_share_action` | Removed. Replaced by `share_click{method}` only. |
| D8 | Manager invitations | Yes, Phase 1 — owner-controlled (§9). |
| D9 | Multi-location accounts | Yes — Organization/Location model (§5). |
| D10 | Vendor direct-publish fields | Only: hours **confirmation** (ack of unchanged hours) and owner's-pick flags. Everything else = change request → review. Policy configurable. |
| D11 | Assisted-update channel | Shared email + SMS inbox, manual, Phase 0/1. No messaging-platform integration. Consent captured at claim/permission form; JA/EN supported; response SLA 1 business day; messages retained as change-request evidence. |
| D12 | Content after downgrade | **Factual content stays public** (identity, hours, address, previously approved menus where rights permit). Removed: badge, analytics access, reports, active deals, new translation service, priority support. |
| D13 | Founding-plan term | **6 months, fixed**, price locked for term; renewal date shown pre-checkout. |
| D14 | Dunning/grace | Day 0/3/7 emails; 14-day grace (badge retained); then downgrade per D12. All values configurable (§22). |
| D15 | Verified badge definition | All required fields (name, address, geo, phone, hours, ≥1 photo, primary category) verified within freshness thresholds (§22) from an approved source. Badge auto-suspends if a required field goes stale. |
| D16 | Contributor observations | Recorded as **observed-status records / exception candidates**, never auto-overwriting canonical facts; conflicts route to moderation. (Amends companion E5.1.) |
| D17 | Permission evidence | Written/recorded approval linked to **each asset and each menu version** (content-source matrix, §19). |
| D18 | Labor measurement | **Active task timers** (start/pause/complete, actor, work type) *plus* elapsed queue time — never queue age alone. |
| D19 | Analytics provider/consent | Decided in TSD; requirement: first-party, cookieless-capable, consent classification per event, EU-visitor-safe default. |
| D20 | Public JSON feed | **Deferred to backlog** (llms.txt + schema.org remain in scope). |
| D21 | AI-referral metric | **Best-effort / experimental**: methodology note in every report, `unknown` referral class always shown, never a contracted deliverable. |
| D22 | Vendor report language | **One report in the vendor's selected language** (EN or JA at launch; KO if requested). |
| D23 | Browser matrix | iOS Safari (last 2), Android Chrome (last 2), and in-app browsers: LINE, Instagram, **KakaoTalk**. |
| D24 | Reliability targets (pilot) | Daily backups; quarterly tested restore; RPO 24h; RTO 12h; async jobs: 3 retries + dead-letter queue + alert. |
| D25 | Backup publisher | Ops contractor trained and granted `publisher` before Phase 1 completion. No single-person publication dependency. |
| D26 | Legal entity & payment processor | **The portal is a product/brand owned by 808eVentures LLC** (no new entity formed at launch). Contracting party on all vendor/contributor/IP agreements: *"[Brand], a product of 808eVentures LLC."* Payment processor: **existing 808eVentures Stripe account** — no new-account dependency. **Carve-out discipline required from day one** (see §25): the portal keeps a separate P&L/accounting class, a dedicated Stripe product/price catalog with segmented reporting, distinctly-assignable brand+domain assets, and IP assigned to the LLC — so the product can be lifted out cleanly at exit without untangling from the bike business. |
| D27 | Brand name & domain | **Open — on the critical path.** Blocks: production public deployment (SEO/GEO authority should accumulate on the final domain), agreements letterhead, `llms.txt`, Stripe product naming, email-sending domain, social/LINE/KakaoTalk handles. *Not* blocking: TSD and foundational build (nothing technical depends on the name; a placeholder is used until chosen). Name must be **destination-scoped, not dining- or Waikiki-locked** (survives category + island expansion), render cleanly in EN/JA/KO (katakana/hangul checked), have an available .com + handles, and clear USPTO/Hawaii-trademark checks. Reusing "808" is optional: strong Hawaii signifier, but partially undercuts separation from the 808eVentures tour identity — and the **portal's public brand must read as visibly distinct from the 808eVentures tour operation** to avoid vendor-perceived conflict of interest (the portal will list/affiliate activity providers). **Decide before Slice 1 ships publicly.** |

---

## 3. Feature-by-phase matrix (authoritative scope)

| Capability | Phase 0 | Phase 1 | Backlog |
|---|---|---|---|
| Public languages | EN/JA/KO (per D2 coverage rules) | same | more languages |
| Listings | 25–40 seeded, permissioned | claimed + growing | expansion zones |
| Menus (translated, approved) | ✔ via D1 external approval | ✔ portal re-approval workflow | — |
| Deals (reveal model) | ✔ | ✔ + vendor requests | unique one-time codes |
| Affiliate modules | ✔ tracked links | ✔ | deeper integrations |
| `/today/` editorial | ✔ weekly | ✔ | automation |
| Maps | static/link-out (compliant) | same | interactive richness |
| Search | ✖ (browse-only) | ✖ | at 100+ listings |
| Claim + verification | ✖ (inquiry form only) | ✔ | — |
| Accounts/organizations/teams | ✖ | ✔ | — |
| Billing (Stripe) | ✖ | ✔ | annual plans |
| Vendor portal + dashboard | ✖ | ✔ (small) | full analytics |
| Monthly vendor reports | ✖ | ✔ (templated ok) | automation |
| Assisted updates (inbox) | ✔ manual | ✔ | integrations |
| Contributor capture | ✖ (manual tooling) | ✔ light | gamification |
| Taxonomy admin | ✔ | ✔ | — |
| Public JSON feed | ✖ | ✖ | ✔ (D20) |
| Consumer accounts/saves | ✖ | ✖ | TBD |

---

## 4. Roles & permission matrix

Roles are capabilities, never people (Ryan initially holds several; identity is never a permission).

Roles: `super_admin` · `publisher` · `editor` · `language_reviewer_ja` · `language_reviewer_ko` · `ops_agent` · `vendor_owner` · `vendor_manager` · `contributor`.

| Action | super_admin | publisher | editor | lang_reviewer | ops_agent | vendor_owner | vendor_manager | contributor |
|---|---|---|---|---|---|---|---|---|
| Edit business facts | ✔ | ✔ | ✔ | ✖ | propose (CR) | propose (CR) | propose (CR) | propose (obs) |
| Edit hours | ✔ | ✔ | ✔ | ✖ | propose | confirm-only direct (D10) + propose | propose | observe |
| Menu upload/extract | ✔ | ✔ | ✔ | ✖ | ✔ (on behalf) | ✔ | ✔ | ✖ |
| Translation edit/QA approve | ✔ | ✔ | ✖ | ✔ (own locale) | ✖ | ✖ | ✖ | ✖ |
| Vendor approval of menu | — | — | record external (D1) | ✖ | record external | ✔ | ✔ if granted | ✖ |
| Publish/unpublish | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Photos: upload / moderate | ✔/✔ | ✔/✔ | ✔/✔ | ✖ | ✔/✖ | ✔/✖ | ✔/✖ | ✔/✖ |
| Deals: create / approve / kill | ✔ | ✔ | ✔/✔/✔ | ✖ | draft | request | request | ✖ |
| Claims: review/resolve disputes | ✔ | ✔ | ✔ | ✖ | triage | — | — | — |
| Billing admin (vendor side) | — | — | — | — | — | ✔ | if granted | — |
| Billing exceptions (platform) | ✔ | ✔ | ✖ | ✖ | view | — | — | — |
| Taxonomy CRUD/merge | ✔ | ✔ | ✖ | ✖ | ✖ | request | ✖ | ✖ |
| User/role management | ✔ | ✖ | ✖ | ✖ | ✖ | invite managers (D8) | ✖ | ✖ |
| Audit log read | ✔ | ✔ | own scope | own scope | own scope | own org | own org | own items |

Privileged roles (`super_admin`, `publisher`, `editor`) require MFA. All mutations audit-logged (actor, before/after, timestamp). Authorization enforced server-side (RLS + API), never UI-only.

---

## 5. Domain model (P0-4)

**BusinessOrganization** (legal/operating entity or brand) → has **BusinessLocation[]** (venue: address, geo, phone, hours, operational status) → each has one **Listing** (portal presentation: categories, photos, plan display cache, publication status) → has **ListingLocale[EN/JA/KO]** (editorial + SEO content per language, own workflow status, slugs).

Supporting entities:
- **OrganizationMembership** (user ↔ organization, role: owner/manager, billing-admin flag)
- **Claim** (org/user → location; evidence, method, status incl. `disputed`)
- **Subscription** (org-level, Stripe-backed; portal billing state per §15) and **Entitlement** (computed from subscription state → feature access; **the source of truth for paid features — never `Listing.plan_tier`**, which is display cache only)
- **MenuDocument → MenuVersion → MenuVersionLocale** (per-language workflow state, approval evidence per D1/D17) → **MenuItem** (per-locale name/description; price, currency, price-type incl. market-price; section; variant; flags; extraction confidence; human-confirmed flag)
- **Deal** (per-locale terms, expiration mandatory, reveal counter, sponsor label)
- **ChangeRequest** (proposed change: source version, field diffs, proposer, state: open/merged/rejected/overridden; replaces last-write-wins per P0-7)
- **ObservedStatus** (contributor/consumer observations: closed sign, line length; never canonical — D16)
- **ModerationCase** (flags, photos, disputes, closure reports; SLA-tracked)
- **Provenance** on every important field: `supplied_by` (vendor / contributor / editor / ops_on_behalf / **migration_first_party**) — the generic `import` value is **removed** (P0-10) — plus `verified_at/by`, `source_type`, `confidence`, `approval_status`, `expires_at`
- **WorkSession** (task timers: actor, work type, active minutes — D18) alongside per-state elapsed timestamps
- **Category/Subcategory** (unchanged from v1 §5, per-locale labels + slugs, `market_id`)
- All content entities carry `market_id` (launch value: `oahu-waikiki`).

---

## 6. State machines (locale-aware — P0-5)

**Location operational status:** `active · temporarily_closed · permanently_closed · suspended · disputed`.

**Listing publication status:** `draft → review_pending → published ⇄ unpublished → archived`. Only `publisher` crosses into/out of `published`.

**ListingLocale status (per language):** `not_started → machine_draft → qa_pending → qa_approved → vendor_review_pending → vendor_approved → published`, plus `stale` and `withdrawn`. **Publication rule:** a language's public page generates only when that locale's minimum field set (name, address, hours, primary category, ≥1 approved photo) is `qa_approved`-or-better; money terms (menus, deals) additionally require vendor approval in that locale. No machine-draft text ever renders publicly.

**MenuVersionLocale:** `translation_pending → qa_pending → qa_approved → vendor_approval_pending → approved (portal | vendor_approved_external per D1) → published → superseded`; `rejected` returns to the failing stage. Prior versions archived, never deleted. Low-confidence **price/allergen fields block QA** until human-confirmed.

**Claim:** `unclaimed → claim_pending → verified_claimed`, with `disputed` (freezes edit rights) and `revoked`.

**Deal:** `requested → approved(scheduled) → active → expired | killed`; reveal validates server-side.

**Billing (portal states, §15):** `none → checkout_pending → incomplete → active → (cancellation_scheduled) → past_due → grace → unpaid | canceled | refunded | disputed_chargeback`, with `downgraded_free` as the landing state per D12.

---

## 7. Information architecture & routing

```
/                             EN home        /ja/  /ko/
/waikiki/{category-slug}/     EN category    /ja/waikiki/{ja-slug}/   /ko/waikiki/{ko-slug}/
/waikiki/{category}/{listing} EN listing     (JA/KO equivalents)
/deals/  /today/  /trust/     (+ /ja/…, /ko/…)
/for-business/                EN             /ja/for-business/        (hreflang pair; KO backlog)
```

- **EN at root, no `/en/`** (D3). hreflang triplets (EN/JA/KO + x-default=EN) on all trilingual pages; canonical per language.
- **Slug policy (6.12):** native-script slugs are canonical for JA/KO (NFC-normalized, percent-encoded); collisions get numeric suffixes; a romanized alias 301s to canonical; slug changes always generate redirects; per-language sitemaps.
- 404 for never-existed; **410 + "recently closed" note + category link** for closed listings; killed deals purge from cache immediately (§20 invalidation).

---

## 8. Consumer requirements

Everything in PRD v1 §6 stands, plus the **public content contract** (P1-3):

| Field | Required? | If missing |
|---|---|---|
| Name, address, primary category | Required | Listing cannot publish in that locale |
| Hours | Required | "Hours unverified — call ahead" state allowed only pre-launch; never for badge |
| Photo | ≥1 approved | Tasteful category-default placeholder, never stock food |
| Menu | Optional | "Menu coming soon — profile verified {date}"; never unapproved translations |
| Price band | Optional | Omit chip |
| Editorial note | Optional | Omit |
| Deal | Optional | Omit section |
| Claim status | — | Unclaimed shows "Is this your business?"; claimed w/o plan shows nothing special; paid shows badge |
| Verification date | Required | Provenance chip always renders; stale (past threshold) renders amber "verified {date}" |

**Hours & open-now rules (P1-4):** support split hours, overnight spans, 24-hour, last-order time (rendered "last order 21:30"), kitchen-vs-venue hours (venue canonical; kitchen optional note), seasonal schedules (date-ranged), appointment-only, `sells_out_early` advisory, unknown-hours state, and exception dates. Timezone fixed `Pacific/Honolulu` (no DST). Open-now derives from venue hours + exceptions and is consistent across cards, detail, and schema. Contributor "it's closed" input creates an ObservedStatus/exception candidate — never edits the weekly schedule (D16).

Sponsored/affiliate labeling, trust page, and report-a-change flow unchanged from v1.

---

## 9. Vendor requirements

**Identity & organization (P0-6):** email+password or magic-link auth with verified email (phone optional second factor); claiming creates or joins a BusinessOrganization; one org ↔ many locations (D9); `vendor_owner` can invite/remove `vendor_manager`s and grant/revoke billing-admin (D8); primary-ownership transfer = owner-initiated + editor-confirmed; support-assisted recovery via re-verification (same evidence standards as claim); compromised account → editor can freeze org access (audit-logged).

**Phase 0 (no portal):** `/for-business/` marketing (EN/JA) + inquiry; founding vendors sign the **content-permission form** (D1/D17) covering listing facts, photos, menu translation approval, and assisted-update consent (D11).

**Phase 1 portal (small):** dashboard (profile completeness; monthly stats: views, direction clicks, menu views, **deal reveals**, referral mix incl. best-effort AI class per D21; plan status) · hours confirm (direct, D10) · change requests for facts · photo upload → moderation · owner's picks (direct) · menu upload → §11 workflow → side-by-side approval · deal requests · Stripe checkout/customer portal with 6-month founding term (D13) · team management (D8).

**Assisted path (first-class):** shared inbox per D11; ops applies via ChangeRequest with provenance `ops_on_behalf` + message stored as evidence; conflict with a pending portal edit triggers the §10 conflict flow — **never last-write-wins** for facts/hours/prices/deals/closure (P0-7).

---

## 10. Admin requirements

Queues: claims (+ disputes) · translation QA per locale (JA queue, KO queue — independent, capacity + SLA visible per D2) · vendor-approval tracking (incl. external-approval evidence recording) · moderation (flags, photos, closure reports, observed-status conflicts) · **change-request review with field-level diff and merge/reject/override** (P0-7) · deals · taxonomy · freshness dashboard (field-level staleness per configured thresholds) · billing exceptions (failed payments, disputes, refunds) · users/roles · audit log.

Queue mechanics: assignable items, age-of-oldest surfaced, per-queue SLA targets (configurable), conflict-resolution ownership: `editor` decides content conflicts; `publisher` decides publication; `super_admin` decides role/billing disputes. Vendor+admin **route/screen inventory** (P1-2) is enumerated in the TSD from the queue and portal lists above; each screen specifies role, purpose, data, actions, empty/error states, analytics, phase.

---

## 11. Trilingual workflow & labor instrumentation

Pipeline per locale (P0-5): capture → extract → machine-translate → locale QA (`language_reviewer_ja` / `language_reviewer_ko`) → vendor approval (portal or `vendor_approved_external` per D1) → publish. Money terms never fall back across languages; identity fields may fall back to QA'd EN only.

Instrumentation (P0-11/D18): every workflow item records elapsed time per state **and** WorkSession active minutes (actor, work type), plus AI/API cost per extraction/translation job, item/page counts, correction rounds, and reviewer. Output: true cost-per-listing, cost-per-menu, and per-locale throughput — reviewed weekly against KO capacity (D2) and fed to the Gate-2 model rebuild.

**Menu safety (P1-5):** never infer allergens or dietary suitability from names or extraction; dietary/allergen labels publish only with explicit vendor confirmation; allergen disclaimer always rendered; source image + capture date linked on every published menu.

---

## 12. Deals — terminology correction (P0-9)

Everywhere (DB, UI, analytics, reports, vendor agreement): **`deal_reveal`** is what we measure; reports say **"code reveals (estimated offer interest)"**; the phrase *verified redemption* is prohibited in Phase 0/1. Reveal = unique per session per deal (repeat taps don't increment). Expiration mandatory; kill switch purges cache immediately.

---

## 13. Billing states & entitlements (P0-8)

Portal billing states per §6. Entitlement behavior:

| Entitlement | active | grace (14d) | canceled at term / unpaid → downgraded_free | refunded |
|---|---|---|---|---|
| Verified badge | ✔ | ✔ | ✖ (listing stays published — D12) | ✖ |
| Published translated menus | ✔ | ✔ | **✔ retained** where rights permit (D12); no new translations | case-by-case with rights |
| Analytics access | ✔ | ✔ | ✖ | ✖ |
| Monthly report | ✔ | ✔ | ✖ | ✖ |
| Active deals | ✔ | ✔ | ✖ (auto-expire) | ✖ |
| Priority/assisted service | ✔ | ✔ | standard queue | ✖ |
| Team seats | ✔ | ✔ | read-only | ✖ |

Stripe is upstream truth; webhooks (signature-verified) update Subscription; **Entitlements are computed and enforced from Subscription state — never from a listing field**. Daily reconciliation job flags drift. Checkout UI, founding agreement, and dunning emails share one config source for term/price/grace (companion Risk 5). Chargeback → `disputed_chargeback`: entitlements suspend, listing content unaffected, editor notified.

---

## 14. Taxonomy

Unchanged from PRD v1 §5 with: Activities hierarchy modeled but **publicly hidden in Phase 0** (D4); category creation remains admin-only; merge/redirect/acceptance test unchanged.

---

## 15. SEO + GEO layer

As PRD v1 §10 **except**: public JSON feed deferred (D20). Retained: full schema.org (`Restaurant`, `Menu*`, `Offer`, breadcrumbs, `ItemList`), JS-free content rendering, `llms.txt` (blocked on brand/domain decision — still open), documented AI-crawler allowlist (GPTBot, ClaudeBot/Claude-User, PerplexityBot, Google-Extended, Bingbot — reviewed quarterly), in-page provenance, canonical NAP discipline. **AI-referral reporting is experimental** (P1-11/D21): best-effort classification, methodology note in every surface that shows it, `unknown` class always present, never a contracted founding-plan deliverable.

---

## 16. Analytics event contract (P0-12)

Provider + consent model chosen in TSD (D19 requirements). Every event defines: canonical name, definition, source (client/server), exact trigger, required/optional properties (always `market_id`, `locale`), dedup rule, bot filtering, consent class, retention, report usage, test case. Resolved definitions:

- `session_start` — anonymous first-party ID, 30-min inactivity timeout; `referrer_class ∈ {organic, ai, social, direct, influencer, qr, unknown}` (classification table versioned).
- `listing_view` — server-side page render event (ad-blocker-resistant) + client enrich.
- `menu_view` — menu section scrolled into viewport ≥1s (not page load).
- `menu_item_expand` — explicit tap.
- `direction_click` — includes map provider + destination listing.
- `deal_reveal` — unique per session per deal; server-validated.
- `affiliate_clickout` — **server-side redirect endpoint** (first-party counted regardless of partner attribution), includes partner + context.
- `share_click{method}` — replaces `save_share_action` (D7); no save events (D6).
- `claim_start` / `claim_submitted` / `claim_verified` (three distinct events — resolves ambiguity).
- `vendor_report_open` — explicit link click, not pixel.
- `language_switch{from,to}` · `report_change{listing}` · `today_note_view`.
Critical funnel events (clickout, reveal, listing_view) have server-side capture; bot filtering documented; no precise-location collection.

---

## 17. Notification matrix (P1-7)

| Trigger | Recipient | Channel | Locale | Timing | Retry/audit |
|---|---|---|---|---|---|
| Claim received / verified / disputed | claimant (+ counterparty on dispute) | email | vendor-selected | immediate | logged |
| Onboarding incomplete | vendor_owner | email | vendor | day 3, 7; ops task day 10 | logged |
| Menu vendor-approval pending | approver | email | vendor | day 3, 7, 14 (then §J3 E3.6 path) | logged |
| Change request resolved | proposer + affected users | email | vendor | immediate | logged |
| Assisted change applied | vendor contact | email/SMS reply | JA/EN | immediate confirmation | stored as evidence |
| Dunning | billing admin | email | vendor | day 0/3/7 (config) | logged |
| Grace ending / downgraded | billing admin | email | vendor | day 10; on downgrade | logged |
| Renewal notice | billing admin | email | vendor | 30 days before term end (D13) | logged |
| Monthly report | vendor_owner (+opt-ins) | email | **vendor-selected (D22)** | configurable report day | `vendor_report_open` |
| Deal expiring | vendor + editor | email | vendor | 7 days prior | logged |
| Queue SLA breach / job dead-letter | ops/admin | email/alert | EN | immediate | monitored |

All timings are configuration (§22), single source of truth shared with agreements and checkout copy.

---

## 18. Content rights & source matrix (P0-10)

| Content | Permitted source | Evidence required | Approval | Review/expiry | Takedown |
|---|---|---|---|---|---|
| Business facts | vendor, editor/contributor in-person, DOH public record | provenance record | editor | staleness thresholds | correction flow |
| Menus & prices | **vendor-supplied source only** | source image + permission form (D1/D17) | locale QA + vendor approval | vendor-triggered + quarterly | immediate on request |
| Photos | vendor upload (license granted in agreement) or contributor original (agreement license) | rights metadata per asset | moderation | on flag | immediate |
| Owner's picks | vendor claim | portal action or recorded instruction | labeled "Owner's picks" | with menu review | vendor-controlled |
| Editorial notes | staff/contributor original | authorship record | editor | 60–90 days | editor |
| Deals | vendor request | approved terms + expiration | editor | auto-expire | kill switch |
| Translations | derived from permitted source | pipeline record | locale QA (+ vendor for money terms) | with source | with source |
| Contributor observations | contributor agreement + disclosure | GPS/timestamp, disclosure field | moderation | ObservedStatus only (D16) | moderation |
Prohibited: bulk third-party imports, cached Google Places content beyond permitted identifiers, third-party review ingestion. Provenance value `import` replaced by `migration_first_party` (approved first-party migrations only).

---

## 19. Non-functional requirements (measurable — P1-8)

**Performance:** reproducible budget — Moto G-class Android + iPhone 12-class, throttled 4G (1.6 Mbps / 150 ms RTT), reference listing fixture (full menu, 6 photos): LCP ≤ 2.5s (lab), page ≤ 500 KB first load excl. lazy images, images AVIF/WebP + responsive. Lighthouse ≥ 90 as check, not sole gate; field CWV monitored post-launch. Browser matrix per D23.
**Reliability:** per D24 (daily backups, quarterly restore test, RPO 24h/RTO 12h, job retries×3 + DLQ + alert, deploy rollback documented).
**Security:** server-side authz everywhere; Supabase RLS with test coverage for every role×entity pair in §4; MFA for privileged roles; Stripe webhook signature verification; upload validation (type/size/scan) + signed media URLs for evidence documents; secrets in managed store; admin session timeout; security event logging.
**Privacy:** no precise-location collection; claim evidence encrypted at rest, access-restricted (`editor`+), retained 24 months then purged; abuse/IP data 90-day retention; analytics per D19; account deletion honored with audit-stub retention.
**Accessibility:** WCAG 2.2 AA target; critical public + vendor flows tested (keyboard, screen reader, contrast) incl. JA/KO text rendering and length expansion in the design system.
**Caching/invalidation (P1-9):** SSG/ISR with on-demand revalidation per locale-page; emergency invalidation path (≤60s) for killed deals, closures, and legal takedowns; no service worker/offline layer in Phase 0/1.

---

## 20. Phase completion criteria (revised)

**Phase 0 done when:** 25–40 permissioned listings · EN + JA publication 100% complete · KO per D2 (founding vendors 100%; seeded ≥70% at launch, 100% within 30 days) · every published menu has stored approval evidence · provenance visible on all listings · public routes render fully without client-side JS · schema passes agreed validation fixtures (fixture set defined in TSD) · direction/menu/deal-reveal/affiliate-click events verified end-to-end (server-side where specified) · trust page + correction flow live · content-rights matrix evidenced for all published content · queue ownership + correction SLA defined · performance passes the §19 reproducible budget.

**Phase 1 done when:** claim → verification → org membership works end-to-end incl. dispute path · Stripe checkout + webhooks reconciled (daily job clean for 2 consecutive weeks) · entitlements behave correctly through active/grace/cancel/downgrade (tested per §13 table) · **8–10 vendors have actually paid** · ≥5 menu updates completed through the full locale workflow incl. version history/rollback · monthly reports use the defined metric dictionary, in vendor-selected language, with AI-referral methodology note · deal surfaces say *reveals* everywhere · active-labor and API cost per menu/listing measurable from WorkSessions · a non-founder `ops_agent` + backup `publisher` (D25) can process standard updates without Ryan · permission, billing, and publication test suites pass.

---

## 21. Implementation sequence (vertical slices)

1. **Permissioned public listing** — org/location/listing/locale model, taxonomy, hours, menu, provenance, admin review/publish, EN+JA public pages, schema, analytics foundation.
2. **Korean workflow** — KO locale records, reviewer role/queue, QA, publication, throughput+cost measurement (start after ≥3 real menus validate the pipeline).
3. **Claim & organization access** — auth, claim, evidence, verification, membership, roles, audit.
4. **Menu updates** — upload, extraction job, item review, locale QA, portal + external vendor approval, publish, rollback, labor tracking.
5. **Paid entitlements** — Stripe checkout, webhook verification, normalized states, entitlement computation, dunning/grace/downgrade, reconciliation.
6. **Merchant outcome reporting** — event aggregation, dashboard, report language, templated delivery, referral methodology note.
7. **Deal & affiliate experiments** — deal schema, review/expiration, reveal measurement, disclosures, click-outs, link health, report presentation.

Core verified-content loop stays ahead of monetization experiments.

---

## 22. Configuration (never hard-coded)

Staleness thresholds per field type · extraction-confidence threshold · max subcategories per listing · grace period · dunning schedule · founding-price hold window · menu-approval reminder cadence · onboarding reminder cadence · moderation/closure-report thresholds · deal expiration behavior · locale availability per market · plan entitlements · badge freshness rules · report-delivery day · affiliate-module ordering · queue SLA targets · referral-classification table.

---

## 23. Amendments to the companion document

The companion's journeys, personas, edge cases, error catalog, and acceptance criteria remain in force **except**: E4.2 last-write-wins → replaced by ChangeRequest conflict flow (P0-7) · E5.1 "contributor wins for observed state" → ObservedStatus records + moderation (D16) · global listing/menu state machines → superseded by §6 locale-aware states · `save_share_action` → `share_click` (D7) · all "redemption" language → "reveal" (P0-9) · subscription state machine → superseded by §6/§13 · OQ-1 search → decided (browse-only, D-matrix) · OQ-3 term → 6 months (D13) · OQ-4 → no email gate confirmed (deal reveal ungated) · OQ-5 → allowlist per §15 · OQ-6 → KO consumer-only vendor UI confirmed.

**Still open (does not block build start):** **brand name + domain only** (D27 — legal entity and Stripe are now resolved via D26; the name blocks public deploy, llms.txt, agreements letterhead, and handles — decide before Slice 1 ships publicly) · photo-rights license wording (OQ-2 — draft with agreements in 90-day plan Days 1–30, on 808eVentures LLC paper per D26).

## 24. Backlog (logged, not lost)

Public JSON feed / partner API / MCP server · unique one-time deal codes · consumer accounts + saves · search (100+ listings) · first-party reviews · locals/visitors scoring · automated conditions feed · AI itinerary chat · contributor gamification · full owner console · annual plans · sponsored-placement product · expansion zones · additional languages · additional markets.

## 25. Carve-out discipline (sellability requirement — per D26)

The portal operates **under 808eVentures LLC for launch convenience but is structured to be lifted out cleanly at exit.** These are standing requirements, not one-time setup — a buyer's diligence punishes retrofitted separation:

- **Separate P&L:** portal revenue and costs tracked as a distinct accounting class/tag (ideally a dedicated bank sub-account); the product's standalone economics must be readable without untangling from bike sales.
- **Segmented Stripe:** dedicated product/price catalog and segmented reporting so subscription revenue is cleanly attributable to the portal, not commingled in one 808eVentures stream. (Prefer a separate Stripe account if plan/ops allow.)
- **Assignable brand + domain:** registered to the LLC but held as distinct, transferable assets.
- **IP assignment:** every contractor/intern who produces code or content assigns IP to 808eVentures LLC (agreements carry this clause).
- **Contracts name the product:** *"[Brand], a product of 808eVentures LLC"* on all vendor/contributor agreements, keeping them portable if the brand spins out.
- **Brand separation in market:** the portal's public brand reads as visibly distinct from the 808eVentures tour/activity identity (conflict-of-interest hygiene, since the portal lists and affiliate-links activity providers).
- **Advisory checks:** confirm Hawaii GET treatment across the two revenue types with the accountant; confirm "product of" language with whoever drafts the agreements.

---

*Definition of Ready and Definition of Done for individual features: adopt Appendices C and D of the July 2026 readiness review verbatim as the team's working agreements.*
