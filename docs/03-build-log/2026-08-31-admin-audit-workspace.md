# Admin audit workspace — 2026-08-31

**Branch:** `codex/admin-audit-workspace`

**Tags:** #project-specific #phase-0

## Scope

Added the read-only `/admin/audit` workspace required by the Phase 0 staff route inventory. The screen uses the existing authenticated Supabase client and row-level security contract: super-admins and publishers receive the complete audit stream, while editors, language reviewers, and operations staff receive only events attributed to their own account.

## Design and behavior

- Shows the latest 100 immutable events in reverse chronological order.
- Summarizes action, target, actor, request correlation, and changed fields without inventing new audit data.
- Keeps full before/after JSON snapshots behind an accessible disclosure control.
- Includes explicit scope messaging, read-only messaging, summary metrics, and empty/error states.
- Extends the shared admin navigation and dashboard without adding a mutation path or changing database policy.
- Adds desktop/mobile overflow and accessibility coverage plus unit tests for snapshot presentation.

## CI performance follow-up

The complete application and browser suites passed, but the five-sample homepage Lighthouse median crossed the existing 2,500 ms LCP budget by 0.7 ms and then 11 ms on a rerun. The diagnostic identifies the homepage introduction paragraph as the LCP element. Its optional Plus Jakarta Sans file is no longer preloaded, so constrained first visits can paint with Next.js's adjusted system fallback without making an optional body font compete with critical CSS. The display font remains preloaded, cached/normal visits retain the design typeface, and the performance budget was not relaxed. The equivalent local five-sample mobile run then passed with performance 0.99, accessibility 1.00, best practices 1.00, and median LCP 1,985 ms.

No production environment, schema, content, or future product feature was changed.
