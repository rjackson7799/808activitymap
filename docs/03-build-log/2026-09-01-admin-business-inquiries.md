# Phase 0 admin business inquiries

Date: 2026-09-01
Tags: #project-specific #phase-0 #admin #privacy

## Scope

Added a narrow staff readback and follow-up workflow for the existing Phase 0
business inquiry form. This is an operational inbox only. It does not create a
claim, vendor account, organization membership, subscription, entitlement, or
publication approval.

## Authorization and privacy

- Only `super_admin`, `editor`, and `ops_agent` may see the workspace or call
  its database functions.
- Reads and status transitions require a live authenticated session at AAL2.
- The underlying table remains fully revoked from direct `authenticated` and
  `anon` access; contact details are exposed only by a guarded function.
- Status transitions require a staff-only note and record the actor and time.
- Inquiry contact fields and message content are excluded from future audit
  snapshots while operational status changes remain audit-logged.
- Publisher and language-review roles do not receive navigation or PII access.

## Interface

- Added `/admin/business-inquiries` with queue counts, oldest-open ordering,
  contact details, consent context, preferred language, and latest staff note.
- Added contacted, closed, and reopen transitions with clear internal-only
  microcopy and mobile-safe form controls.
- Added role-aware admin navigation and dashboard discoverability.

## Verification

- TypeScript, lint, unit, optimized-build, database, and browser suites cover
  the role boundary, AAL2, direct-table denial, audited transitions, PII audit
  exclusion, desktop/mobile layout, and accessibility.
- After the workstation reboot, Windows did not permit this task to start the
  stopped Docker system service. The clean Node 24 CI environment is therefore
  the authoritative full migration replay and browser verification for this
  slice.
