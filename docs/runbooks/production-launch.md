# Production launch runbook

This runbook converts the Phase 0 completion criteria in the PRD into an evidence-based release decision. Passing the gate does not authorize deployment; production deployment always requires an explicit human approval.

## Current decision

**NO-GO as of 2026-08-29.** Application CI and the staging preview are healthy. The unresolved gates are final brand/domain, launch content, staffing, final-domain verification of machine-readable discovery, production infrastructure, reliability operations, and the production-equivalent performance fixture.

Run the versioned gate from the repository root:

```text
npm run release:check
```

Evidence lives in `config/production-readiness.json`. Update a value only after linking durable evidence in the release PR or its approval record. Never put credentials, tokens, personal contact information, or private agreements in this file.

## Gate ownership and acceptance

| Gate | Owner | Acceptance evidence |
|---|---|---|
| Brand and domain | Product/legal | Approved destination-scoped name; `.com`, handles, and trademark checks; final domain registered to 808eVentures LLC as a distinct assignable asset |
| Launch inventory | Content/ops | 25–40 permissioned listings; EN and JA complete; founding-vendor KO 100%; seeded KO menu coverage at least 70% |
| Publication staffing | Ops | Named KO reviewer and backup plus a trained non-founder backup publisher |
| Trust surfaces | Product/engineering | Localized trust page and end-to-end report-a-change flow with moderation ownership and correction SLA |
| Machine-readable discovery | Product/engineering | Branded `llms.txt`, production robots policy, sitemap, and schema fixture validation |
| Production platform | Engineering | Separate production Vercel and Supabase resources, final DNS, production-only secrets, migrations applied through CI, and no seed execution |
| Protection rules | Repository admin | `main` requires PRs and the four CI jobs; Production environment requires approval and restricts deployment branches |
| Reliability | Engineering/ops | Daily backups and eligible PITR confirmed, restore drill within the last quarter, RPO 24h/RTO 12h signed off, uptime/error/field-CWV alerts tested |
| Performance | Engineering/content | Moto G-class and iPhone 12-class run against a full-menu reference listing with at least six real responsive photos; LCP at most 2.5s, first load at most 500KB excluding lazy images, Lighthouse categories at least 90 |

## Verified baseline

- Merged `main` CI is green.
- `808eventures` is the provisional staging brand. Final D27 approval and the production domain remain open.
- The linked `808activitymap-staging` Vercel project uses Node 24 and remains a staging resource.
- The linked Supabase resource is `808ActivityMap Staging2026`; no dedicated production project exists.
- The linked staging database migration history matches the repository through `20260830011000`, including Korean listing follow-on and permissioned menu seeding.
- The 2026-08-30 staging backup audit reported WALG enabled, PITR disabled, and no recoverable timestamp. This does not close the production backup, PITR, or restore-drill gates.
- Hosted staging signup disablement still requires dashboard read-back; do not use the local `config.toml` as a hosted configuration payload because its redirect URLs are local-development values.
- Staging blocks indexing and currently exposes two listings in EN and JA, with no KO URLs.
- PR #8 staging preview verifies localized EN/JA trust pages and the complete report-a-change path: public intake, protected storage, 48-hour editorial ownership, MFA-gated review, and version-conflict handling.
- The machine-readable discovery implementation now includes environment-branded `llms.txt`, fail-closed pre-production robots policy, a production crawler allowlist and sitemap reference, publishability-gated EN/JA sitemap entries, and fixture-tested listing/category JSON-LD. The gate remains open until these are verified on the approved final production domain.
- `main` requires PRs, current successful results from all four CI jobs, resolved conversations, and applies protections to admins; force-push and deletion are disabled. The GitHub Production environment is restricted to protected branches and requires approval by the repository owner.
- The homepage hardening gate passed at performance 0.98, accessibility 1.00, best practices 1.00, LCP 2,417ms, and 210,872 bytes. This is not a substitute for the required full-photo reference-listing run.

## Final rehearsal

1. Freeze content and migrations for the rehearsal window.
2. Run static, unit, database, full browser, and reference-listing Lighthouse checks from the release commit.
3. Restore the latest production backup into an isolated staging project and execute the restore validation in `docs/runbooks/restore.md`.
4. Exercise rollback using an immutable staging deployment and confirm forward-only database compatibility.
5. Verify production robots, canonical URLs, sitemap, `llms.txt`, structured data, EN/JA/KO routes, correction intake, alert delivery, and backup status.
6. Record the release commit, evidence links, approver, rollback target, and decision timestamp.
7. Request explicit approval for production deployment. Do not promote a preview deployment as a shortcut.
