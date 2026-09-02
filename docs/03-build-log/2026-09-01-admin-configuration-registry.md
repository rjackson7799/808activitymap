# Phase 0 admin configuration registry

## Scope

Implemented the PRD §22 / TSD §23 staff registry at `/admin/config`. The surface exposes the existing `app_config` contract; it does not add settings, activate Phase 1 features, or make production changes.

## Authorization and safety

- Every staff role can inspect the current registry, matching the existing read policy.
- Only `super_admin` with an AAL2 session receives editing controls and can update rows.
- The server action independently checks the live role and AAL before writing; database RLS repeats that boundary.
- Keys are selected from the typed registry. The screen never creates or deletes rows, and it reports missing or unregistered row drift for migration-based repair.
- Submitted values must be valid JSON and pass the selected key's existing Zod schema before the database update.
- Updates set `updated_by`, trigger the existing immutable before/after audit record, and invalidate affected public caches.

## Product and design decisions

- Values remain JSON because the authoritative contract includes scalars, arrays, nested objects, and versioned rule tables. The editor therefore uses a visible, labeled, monospaced JSON surface with examples and schema-specific error feedback.
- Entries are grouped by current operational purpose: publication, markets, content operations, reminders, commercial policy, and traffic/safety. Commercial values are explicitly described as contracts defined now for later phases; editing them does not activate billing, deals, accounts, or vendor functionality.
- Critical keys are labeled, change metadata is visible, and non-super-admins receive a readable formatted value instead of disabled form controls.

## Verification

- Pure registry tests cover exhaustive grouping, JSON parsing, per-key schema enforcement, unregistered keys, and readable formatting.
- Database tests cover staff read visibility, role-less isolation, super-admin/AAL2-only mutation, and immutable audit attribution.
- Browser tests cover super-admin update and validation failure, editor read-only access, desktop/mobile layout, and axe accessibility.
- Existing typecheck, lint, unit, database, browser, and Lighthouse gates remain authoritative before staging deployment.

## Operational boundary

This change targets staging review only. It does not alter hosted Supabase Auth settings, seed real content, deploy to production, or promote any deferred Phase 1 surface.
