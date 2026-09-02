# Phase 0 admin menu approvals

## Scope

Added the missing `/admin/approvals` workspace required by the TSD route inventory and the Phase 0 completion rule that every published menu retain written vendor-approval evidence. The screen is an aggregate staff queue over the existing guarded menu workflow; it does not add vendor accounts, portal approval, notifications, uploads, or any other Phase 1 feature.

## Implementation

- Pending `qa_approved` and `vendor_approval_pending` menu locales are shown first, oldest first, with their configured day 3/7/14 reminder cadence.
- Completed approval and publication records remain visible with evidence path, actor, timestamp, locale, version, and a link to the listing publication review.
- Editors, operations agents, publishers, and super-admins can record `vendor_approved_external` with an already-ingested approved evidence document. Other staff receive read-only tracking.
- The server action requires AAL2 and the database transition independently rechecks role, assurance, evidence kind, source rights, valid workflow state, approver attribution, and audit logging.
- Recording an approval revalidates both the listing publication screen and the aggregate approvals queue.
- No schema migration was needed; the existing database contract remains authoritative.

## Verification

- TypeScript and ESLint pass locally.
- The complete unit suite passes: 31 files, 259 tests.
- The optimized build compiles and completes TypeScript. Page-data collection cannot finish locally because Docker Desktop / local Supabase is unavailable after reboot; CI runs the database and browser suites against a clean Supabase instance.
- Browser coverage exercises a real editor MFA session, evidence selection, guarded transition, actor attribution, read-only reviewer access, mobile layout, and axe accessibility.
- Existing database suites already cover evidence constraints, direct-column denial, role/AAL isolation, state transitions, source rights, and audit behavior.

## Release boundary

Staging review only. Production remains untouched and still requires explicit approval under the production launch runbook.
