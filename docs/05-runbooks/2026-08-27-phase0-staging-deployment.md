# Phase 0 Staging Deployment Runbook — 2026-08-27

## Release identity

- Repository: `808ActivityMap`
- Branch: `codex/phase0-staging-hardening`
- Baseline: `075fe64890488bb2f547d25c74bf443edbe46ddd`
- Release commit: `5d620f7e40a270e8249e0eca5980143de7223897`
- Supabase staging project: `808ActivityMap Staging2026` (`onimchorvakehgundrsd`)
- Vercel staging project: `honu-vibe/808activitymap-staging`
- Expected staging origin: `https://808activitymap-staging.vercel.app`
- Existing rollback deployment: `dpl_B1D3DQTmCdcir9rwj5ySBK4muxG6`

The pre-existing untracked `docs/specs/` directory is never inspected, staged,
committed, copied, or uploaded. Do not deploy directly from the current dirty
working directory. Use the immutable Git commit through the Vercel Git
integration or a separately verified clean checkout/worktree.

## Approval gates

Each gate stops for explicit approval. Do not combine approval for one gate
with later hosted changes.

1. Read-only preflight and release-plan confirmation.
2. Hosted Auth/settings and managed-secret changes.
3. Forward-only staging database migration deployment.
4. Application deployment at the exact release commit.
5. Staging smoke verification and release acceptance.

## Gate 1 — read-only preflight

No repository, database, Vercel, Supabase, DNS, Auth, Storage, or application
state changes are allowed in this gate.

Confirm:

- Branch and release commit match the release identity above.
- Baseline is an ancestor of the release commit.
- Git status contains only the existing untracked `docs/specs/` entry.
- The local committed diff passes `git diff --check`.
- Supabase is linked to project `onimchorvakehgundrsd`.
- Hosted migration history ends at `20260827120000` and the ten Phase 0
  migrations are pending in timestamp order.
- Vercel is linked to `honu-vibe/808activitymap-staging`.
- Vercel has the required variable names in the correct staging/Production
  scope. Inspect names, scopes, and Sensitive/plain classification only; never
  print or download secret values.
- Current hosted Auth, hook, Data API, RLS, SSL, and network-setting evidence is
  refreshed read-only where the available interfaces permit it.
- No newer staging deployment or database change has invalidated the rollback
  target.

Required Gate 1 output:

- A pass/fail table for every check.
- The exact pending migration list.
- The exact hosted changes proposed for Gate 2.
- The exact database behavior and forward rollback proposed for Gate 3.
- The exact application deployment and immutable rollback target for Gate 4.
- A clear stop requesting approval for Gate 2 only.

## Gate 2 — hosted settings and secrets

### Proposed behavior

- Disable public signup in staging. Existing users continue to sign in; email
  confirmation remains required.
- Ensure the custom access-token hook is active.
- Provision distinct, high-entropy staging values for `IP_HASH_PEPPER`,
  `EVENTS_INTERNAL_TOKEN`, and `CRON_SECRET` as managed Sensitive values.
- Set `APP_ENV=staging`.
- Set `EVENTS_INGEST_ORIGIN` to the bare trusted HTTPS staging origin.
- Preserve existing Supabase URL/key/database/brand values unless preflight
  proves a correction is necessary.
- Leave `SENTRY_DSN` unset and do not enable PostHog forwarding.
- Make no Data API or network-policy change unless Gate 1 identifies an exact
  mismatch and that individual change is explicitly approved.

Never print secret values. Confirm changes by name, scope, type, and successful
application validation only.

### Rollback

- Restore the prior signup and hook settings from the Gate 1 snapshot.
- Restore the prior Vercel environment-variable versions or values through the
  managed dashboard; do not expose them in logs.
- Restore the older application deployment before removing
  `EVENTS_INGEST_ORIGIN` or other values required by the new application.
- Secret rotation is preferred over restoring a secret that may have been
  exposed during an incident.

Stop for Gate 3 approval after read-back verification.

## Gate 3 — forward-only database deployment

### Proposed behavior

Apply these pending migrations in timestamp order:

1. `20260828090000_storage_write_mfa.sql`
2. `20260828100000_immutable_media_workflow.sql`
3. `20260828102000_media_workflow_guards.sql`
4. `20260828110000_rls_policies.sql`
5. `20260828120000_rls_policies.sql`
6. `20260828130000_operator_revocation.sql`
7. `20260828140000_rls_policies.sql`
8. `20260828150000_operator_revocation_all_roles.sql`
9. `20260828160000_rls_policies.sql`
10. `20260828170000_mfa_audit_fallback.sql`

The final state requires MFA for privileged Storage writes, removes direct
public-photo overwrite/delete, makes listing-media replacement function-owned,
makes role removal function-owned with live session checks, and adds the
service-only MFA audit fallback. Approved `ops_agent` upload behavior remains.

First run the linked dry-run and review its exact output. After separate
approval, apply all migrations during one controlled window. Immediately read
back migration history, lint the linked database, and verify the final function
ACLs, triggers, grants, policies, and RLS state before application deployment.

Do not apply `supabase/seed.sql`; staging already has its prior fixture state and
this release does not require reseeding.

### Rollback

Never edit, delete, or mark a shipped migration as reverted. If Gate 3 must be
reversed after application:

- Add later forward migrations recreating the prior Storage policies from
  `20260710090010_media.sql`.
- Add later forward migrations restoring the prior listing-media policies and
  dropping the guarded replacement/identity helpers after the older app is
  restored. Do not delete versioned objects or append-only audits.
- Add a later migration restoring the prior claim-only `is_platform(text[])`,
  dropping `revoke_platform_role`, and restoring the prior role-management
  policies. Deleted Auth sessions are not recreated; users sign in again.
- Deploy the prior browser-based MFA page before a later migration revokes and
  drops `ensure_mfa_factor_audit`. Keep existing audit rows.

Stop for Gate 4 approval after database verification.

## Gate 4 — application deployment

### Proposed behavior

Deploy exactly commit `5d620f7e40a270e8249e0eca5980143de7223897`
to `honu-vibe/808activitymap-staging`. Prefer Git-backed deployment so Vercel
builds the committed tree and cannot include local untracked files.

Confirm the deployment commit SHA, project, environment, aliases, build result,
and environment-variable validation before directing smoke traffic to it.

### Rollback

Promote or redeploy the previously verified immutable staging deployment
`dpl_B1D3DQTmCdcir9rwj5ySBK4muxG6`. Database compatibility must be evaluated
first: the old app can run while the stricter Storage/RLS state remains, but
operator role deletion and the MFA enrollment implementation differ. If a full
behavior rollback is required, use the Gate 3 forward rollback plan; never
reverse migration history.

Stop for Gate 5 approval before stateful smoke tests.

## Gate 5 — staging smoke verification

Use dedicated staging test identities and unique test records. Avoid production
accounts and do not delete unrelated staging data.

- Public signup is rejected; existing confirmed users can sign in.
- First-login TOTP enrollment reaches `aal2`; later login challenge still works.
- MFA INSERT/UPDATE/DELETE lifecycle events are present once with sanitized
  snapshots and no TOTP secret, code, QR payload, challenge, or token data.
- A privileged `aal1` direct Storage write is denied; `aal2` succeeds.
- Approved ops-only upload behavior remains; a mixed privileged+ops `aal1` token
  cannot use the ops exception.
- Stable-key public-photo overwrite/delete is denied.
- Guarded photo replacement preserves the public URL construction and writes
  the expected before/after attachment audit.
- Operator revocation removes the chosen role, deletes all target sessions,
  audits the reason/session count, and makes a captured pre-revocation token fail
  a privileged operation.
- Public EN/JA pages and a seeded listing return expected responses; malformed
  listing encoding remains 404 and `/api/events` GET remains 405.
- Analytics creates the expected session/listing counts and never forwards the
  internal token across a redirect or request-supplied origin.
- Auth, application, database, and audit logs contain no unexpected errors or
  sensitive values.

Record identifiers for only the deliberately created smoke records. Clean them
up through reviewed, scoped operations or leave append-only audit records intact
and mark the fixtures clearly.

## Release acceptance

Accept staging only when all gates pass, no reportable security regression is
found, the rollback target remains available, and the final Git status still
contains only the untouched untracked `docs/specs/` directory. Production
promotion requires a separate plan and explicit approval.
