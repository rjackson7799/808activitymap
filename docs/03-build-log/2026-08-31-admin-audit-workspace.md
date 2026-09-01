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

No production environment, schema, content, or future product feature was changed.
