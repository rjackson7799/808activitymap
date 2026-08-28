# Phase 0 Staging Hardening — 2026-08-27

**Branch:** `codex/phase0-staging-hardening`
**Baseline:** `075fe64890488bb2f547d25c74bf443edbe46ddd`

## Baseline and constraints

- Confirmed the branch and baseline commit; the only worktree entry was the pre-existing untracked `docs/specs/` directory.
- Read the completed security report, `CLAUDE.md`, the relevant PRD/TSD requirements, affected source and migrations, existing unit/database/Playwright tests, and the prior CP5 development log.
- Did not inspect or modify `docs/specs/`. No baseline scan was repeated.
- No remote environment changes are authorized. Hosted verification remains read-only.

## Change 1 — hosted secret fail-closed boundary

- Limited development defaults to explicitly selected `APP_ENV=local` or `APP_ENV=test`.
- Staging and production now require `IP_HASH_PEPPER`, `EVENTS_INTERNAL_TOKEN`, and `CRON_SECRET` and reject their known development literals.
- An unset `APP_ENV` now fails closed instead of being silently treated as local.
- Updated `.env.example` with the explicit environment contract and hosted-secret guidance.
- Added unit coverage for local/test defaults, missing staging secrets, known-literal rejection in both hosted modes, and an unset environment.
- Focused environment tests: 21 passed. Typecheck and lint passed.
- Independent bypass/regression review found no concrete surviving route or legitimate regression.

### Rollback

- Revert the focused secret-hardening commit. This change has no database migration or persisted-data effect.

## Change 2 — trusted analytics callback destination

- Removed the request-derived origin from the server-capture API and source path.
- Added `EVENTS_INGEST_ORIGIN` as a server-only deployment-local origin. Hosted environments require HTTPS; credentials, paths, queries, fragments, and non-HTTP schemes are rejected.
- Set the secret-bearing callback to `redirect: error`, preventing the internal token from following any redirect.
- Preserved the existing session-start/listing-view call order, filtering, and counting logic.
- Bound Playwright's production test server to its own callback origin and added hostile-metadata and redirect regression tests.
- Focused environment/transport tests: 30 passed. Typecheck and lint passed.
- Independent bypass/regression review found no concrete surviving route or legitimate regression; its full unit run passed 182 tests across 15 files.

### Rollback

- Revert the focused analytics-transport commit and remove `EVENTS_INGEST_ORIGIN` only after the prior deployment is restored. No database or public URL rollback is required.

## Change 3 — direct Storage write MFA

- Added a new forward-only migration replacing only the five Storage write policies; the original migration remains untouched.
- `super_admin`, `publisher`, and `editor` now require `aal2` for direct photo, menu-source, and evidence mutations.
- Preserved the existing ops-only photo/menu behavior at `aal1`. Mixed privileged+ops JWTs cannot use that exception to bypass MFA.
- Kept public photo reads, private bucket reads, bucket definitions, and service-role behavior unchanged.
- Added direct `storage.objects` tests for privileged aal1 denial/aal2 success, the ops-only exception, the mixed-role case, evidence denial, and cross-bucket update denial.
- Applied the migration to local Supabase without resetting data. Focused Storage tests: 6 passed; local database lint reported no schema errors.
- Independent bypass/regression review found no concrete issue; its full database run passed 310 tests across 21 files.

### Rollback

- Before deployment: revert the focused migration commit.
- After deployment: add a later forward-only migration that drops the five replacement policies and recreates the definitions from `20260710090010_media.sql` verbatim. Do not edit or remove either shipped migration.
