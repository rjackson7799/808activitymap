# CP5 Analytics and Observability Completion — 2026-08-27

**Checkpoint:** CP5 analytics and observability
**Branch:** `codex/cp5-analytics-completion`
**Baseline:** `7928225fd437eb01ea5504e0c8306b666784bca1`

## Baseline inspection

- Read `808_portal_PRD_v2_FINAL.md`, `808_portal_TSD_v1.md`, `CLAUDE.md`, the pending analytics implementation, its database migrations, and its tests.
- Confirmed the pre-existing worktree contained CP5 analytics/observability changes plus one unrelated untracked onboarding spec.
- Created the branch and committed only the scoped CP5 work. The unrelated onboarding spec remains untracked and untouched.
- Baseline rollback: restore an individual path with `git restore --source=7928225fd437eb01ea5504e0c8306b666784bca1 -- <path>`, or create a baseline branch with `git switch -c codex/cp5-baseline 7928225fd437eb01ea5504e0c8306b666784bca1`.

## Changes

### Public analytics behavior

- Added analytics markers to the actual language-switch, directions, and menu-section controls.
- Rendered the existing share control on listing pages and bound it to the listing id and locale.
- Made clipboard success conditional on an available `writeText` function resolving successfully; unavailable or rejected clipboard access no longer changes the label or emits `share_click`.
- Added the listing analytics context to the rendered listing page.
- Changed client listing-view capture to fire only after an actual pathname transition. A full document listing load remains server-authoritative and is no longer duplicated during hydration; normal Next.js client navigation emits one client view.
- Minted/refreshed the anonymous 30-minute session on every real public document load, while continuing to capture server `listing_view` only for canonical listing document requests. Client beacons refresh the same cookie.
- Validated session ids as server-minted UUIDs, forwarded the landing query for QR/referrer classification, and made malformed percent-encoded listing slugs fall through safely to the existing not-found behavior.
- Enforced locale presence and a valid listing target at the ingestion boundary for all implemented events.

### Database and retention

- Added a new forward-only analytics contract/retention migration; no shipped migration was edited.
- Added `NOT VALID` constraints that enforce non-null locale/session and a non-empty market for new events without guessing values for legacy rows.
- Added a service-role-only `prune_events` function and wired the authenticated daily partition cron to enforce `retention_days.events` alongside rate-limit retention.
- Rolled the generated RLS policy migration forward because the generator requires its output to sort after every schema migration; policy semantics are unchanged.

### Configuration and observability

- Documented `IP_HASH_PEPPER`, `EVENTS_INTERNAL_TOKEN`, `CRON_SECRET`, and the optional/inactive `SENTRY_DSN` seam in `.env.example`.
- PostHog forwarding remains disabled. No Sentry or other dependency was added.

### Tests and verification

- Added Playwright database assertions for full-load listing view (including no hydration duplicate), client-side listing navigation, direction click, EN→JA language switch, one-second menu visibility, and successful share copy.
- Added browser regressions for unavailable clipboard support (no success label/event) and malformed percent-encoded listing slugs (404, never proxy error).
- Typecheck: passed after public analytics behavior change.
- Lint: passed after public analytics behavior change.
- Focused analytics/observability/env unit tests: 41 passed. The first sandboxed attempt was blocked by local worker spawn permissions; the approved local rerun passed.
- Full unit suite: 165 passed.
- Local Supabase/DB/Playwright status: not yet verified because `127.0.0.1:54332` refused connections and no project Docker containers were running after the safe start attempt.

## Rollback ledger

- Behavioral/UI changes: revert their focused commit; no public route or closed-listing behavior is altered.
- Database changes: use a new forward-only reversal migration; never edit a shipped migration.
- Configuration changes: revert the focused configuration commit and remove the corresponding values from the environment only after the older deployment is restored.
