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

## Change 4 — immutable and audited media mutation workflow

- Added a forward-only migration removing authenticated public-photo overwrite/delete policies. New bytes require a fresh object key; existing objects and URL construction are unchanged.
- Added an `aal2`-guarded `replace_listing_photo` function for `super_admin`, `publisher`, and `editor`. It locks the current attachment, validates an approved same-market public photo with complete rights, preserves position/market, and performs one audited pointer update.
- Closed the ops insert-time moderation bypass: ops uploads must begin pending and ops can no longer attach listing media directly.
- Updated the RLS source model and advanced its generated forward migration; no shipped migration was edited.
- Added database coverage for immutability, key collisions, role/AAL enforcement, stale or unapproved replacements, audit before/after, and ops upload restrictions.
- Independent review identified direct attachment update, mutable media-path, and missing-object bypasses. Added forward-only guards making replacement/removal function-owned, media identity immutable, and backing Storage-object presence mandatory.
- Final focused checks: 19 RLS-model tests and 56 media/Storage/RLS/audit database tests passed.
- Full unit suite: 182 passed across 15 files. Full database suite: 319 passed across 22 files. Typecheck and lint passed; local database lint reported no schema errors.

### Rollback

- Before deployment: revert the focused media-workflow commit.
- After deployment: add a later migration restoring the two public-photo update/delete policies from `20260828090000_storage_write_mfa.sql`, dropping the replacement function and insert guard, and apply a newly generated RLS migration restoring the prior listing-media policies. Do not delete versioned objects. Reverse selected pointer changes through an explicitly audited repair using the audit snapshots; never infer or bulk-delete them.

## Change 5 — atomic operator revocation and live authorization

- Added a forward-only atomic revocation function restricted to a live `super_admin` session at `aal2`. It locks the target user, removes one selected platform role, deletes every target Auth session, and records the reason and revoked-session count in an explicit audit entry in the same transaction.
- Changed the shared `is_platform` authorization helper to require the intersection of the signed JWT role, the current `user_roles` row, and a matching live `auth.sessions` row. A captured access token therefore stops satisfying database policies immediately after revocation even if its signature has not expired.
- Changed the server-handler authorization boundary to perform the same live database check after verifying signed claims and before applying any requested MFA check. Lookup failures deny access.
- Advanced the generated RLS migration so every existing policy consumes the live authorization helper without modifying any shipped migration.
- Independent review found that the original generated role-management policies still allowed direct UPDATE/DELETE, bypassing session revocation. Added later forward-only correction migrations making all role removal/replacement function-owned while preserving direct `super_admin@aal2` INSERT grants. The revocation RPC accepts every current platform role so reviewer/contributor removal capability is preserved.
- A successful revocation deliberately produces two complementary immutable audit rows: the generic `user_roles` DELETE snapshot and the explicit `operator_role_revoked` event carrying the reason and revoked-session count.
- Updated the database harness to issue realistic test identities, roles, and sessions while keeping intentionally unavailable future roles inert.
- Added unit coverage for successful live authorization, stale-token denial, lookup failure, claim mismatch, and function-owned role-removal grants. Added database coverage for atomic role/session deletion, denial without super-admin `aal2`, both audit layers, refreshed access-token claims, denial of an editor operation attempted with the captured token, direct UPDATE/DELETE/upsert denial, and continued direct role grants.
- Focused checks: 23 role-model/handler unit tests passed; 53 role/RLS database checks passed after the forward correction, followed by 3 focused revocation tests.
- Final full checks for this change: 186 unit tests and 322 database tests passed; typecheck and lint passed with no errors or warnings; database lint found no schema errors.
- Independent post-patch review found no surviving authenticated removal/replacement route and no legitimate regression. Its own test launch was sandbox-blocked, while the parent-run focused and full suites above completed successfully.

### Rollback

- Before deployment: revert the focused operator-revocation commit.
- After deployment: add a later migration restoring the prior claim-only `is_platform(text[])` definition from `20260710090003_markets_and_auth_helpers.sql`, dropping `revoke_platform_role(uuid, text, text)`, and applying a newly generated RLS migration that restores direct `user_roles` UPDATE/DELETE. Revert the handler live-check commit in the matching application release. Revoked sessions are intentionally irreversible and must not be recreated; affected operators sign in again.

## Change 6 — verified, nonblocking MFA audit fallback

- Added a forward-only, service-role-only audit verification function for application-managed TOTP INSERT/UPDATE/DELETE events. It accepts only scalar, allowlisted lifecycle fields, checks for the exact canonical trigger audit, and writes one minimal `actor_source=service` fallback row only when that event is absent.
- The helper never stores QR data, TOTP secrets, codes, challenge IDs, tokens, or arbitrary JSON. Invalid lifecycle transitions raise; audit lookup/storage failures emit a generic database warning and return `failed` instead of blocking MFA.
- Moved factor mutations from the browser into cookie-bound server actions. The actor comes from signature-verified claims; factor state comes from Supabase Auth responses rather than client input. Existing verified-factor challenges remain non-mutating and create no lifecycle audit.
- Successful audit verification is bounded to 1.5 seconds. RPC errors, storage failures, and timeouts emit structured server logs containing only operation and factor UUID, while successful enrollment/verification continues unchanged.
- Abandoned unverified-factor deletion is now checked instead of silently ignored. A real deletion error remains user-visible and prevents a conflicting enrollment attempt; only audit failures are nonblocking.
- Strengthened the database drift check to prove the trigger is enabled, bound to `auth.mfa_factors`, invokes `public.audit_mfa_factor_change`, and covers row-level INSERT/UPDATE/DELETE—not merely that a trigger with the expected name exists.
- Focused checks: 7 MFA action tests passed, covering existing-factor challenge, enroll/delete audit calls, secret exclusion, audit failure, timeout, mutation failure, successful verification, and rejected codes. Forty MFA/auth-hook/RLS database checks passed, including primary-audit idempotence, missing-event fallback, service-only execution, minimal snapshots, and invalid transition denial. Typecheck and lint passed; local database lint found no schema errors.
- Full checks for this change: 193 unit tests and 325 database tests passed. Independent post-patch review found no surviving application-managed MFA audit bypass, privacy leak, or legitimate public-flow regression.

### Rollback

- Before deployment: revert the focused MFA-audit commit.
- After deployment: deploy the prior browser-based MFA page first. Then add a later forward migration revoking and dropping `ensure_mfa_factor_audit(uuid, uuid, text, text, text, text, text)`. Leave existing append-only fallback audit rows intact. The original GoTrue trigger remains the primary audit path throughout.

## Read-only hosted verification

- Queried the staging project without changing its database or dashboard configuration. Hosted migrations currently stop at `20260827120000`; none of this branch's forward migrations has been deployed.
- Signup is currently enabled (`disable_signup=false`). This is a staging release blocker under the Phase 0 requirements until an authorized operator disables it in the hosted Auth settings.
- Email confirmation is required (`mailer_autoconfirm=false`), and phone auto-confirm is also disabled.
- Verified that the enabled `audit_mfa_factors` trigger is bound to `auth.mfa_factors`, covers row-level INSERT/UPDATE/DELETE, and invokes `public.audit_mfa_factor_change`.
- Verified custom access-token hook function permissions: `supabase_auth_admin` can execute it, while `anon` and `authenticated` cannot. Hook activation itself was not observable through the read-only interfaces and remains a dashboard check.
- Verified row-level security is enabled on all 32 hosted `public` relations and all 8 hosted `storage` relations examined.
- Verified hosted PostgreSQL SSL is enabled. The effective `pg_hba` rules and broader network restrictions were not readable with the hosted role and remain dashboard checks.
- The service-role Data API schema advertises the expected public relations and RPCs. Anonymous requests using the hosted legacy anonymous key were rejected at the API/key layer. The exact dashboard exposed-schema configuration remains a manual check.
- Hosted security advisors still report baseline mutable-`search_path` and broadly executable SECURITY DEFINER helper warnings, plus expected no-policy notices for server-only partition/rate-limit tables. These are remaining hardening scope rather than changes introduced by this branch.
- No hosted setting, secret, migration, function, policy, or data was changed.

## Completed verification

- Type checking passed.
- Lint passed with no errors or warnings.
- Unit tests passed: 193 tests.
- Database tests passed: 325 tests.
- Local database lint reported no schema errors.
- Production build passed.
- Playwright passed: 40 tests, including the real MFA journey, analytics counting and hostile callback cases, admin/public behavior, data-leakage checks, and no-JavaScript behavior.
- Codex Security diff scan `9f97e916-3bc5-47f5-9f03-342ee5498216` reviewed the exact product-change range from baseline `075fe64890488bb2f547d25c74bf443edbe46ddd` through `520de99d38957e85af9dc895659648fa64df4fd0`. It closed all 19 authoritative review items with zero reportable findings. One residual orphan-upload logging candidate was rejected because immutable fresh keys cannot overwrite/delete existing bytes or alter audited listing attachments, matching the baseline report's approved remediation design.
