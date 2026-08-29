# Backup and restore runbook

## Objective

Meet the pilot reliability target: daily backups, a quarterly tested restore, RPO of 24 hours, and RTO of 12 hours. A dashboard claim that backups are enabled is not sufficient; a successful isolated restore and application validation are required.

## Safety boundaries

- Restore only into a newly created, isolated non-production Supabase project.
- Never reset, seed, relink, or overwrite the production project during a drill.
- Do not copy credentials, database dumps, customer data, or signed URLs into the repository or issue tracker.
- Use a named operator and a second reviewer. Record timestamps and evidence locations without secret values.
- Database migrations are forward-only. Reversal uses a new migration or an application rollback that remains compatible with the current schema.

## Quarterly drill

1. Record the source project, backup timestamp, expected recovery point, operators, and incident/drill identifier in the private operations record.
2. Confirm the source backup is no more than 24 hours old and that the plan's PITR window is active.
3. Create a fresh isolated restore target with production-equivalent Postgres extensions and region where practical.
4. Restore the selected backup using the provider-supported recovery workflow. Start the RTO clock before the restore request.
5. Point a temporary clean application deployment at the restore target using newly generated drill-only secrets. Keep indexing disabled.
6. Validate migration version, required extensions, row counts for core tables, publication eligibility, locale availability, RLS/grants, storage object references, audit-log integrity, and scheduled-job configuration.
7. Run the database contract suite and a read-only smoke journey for home, category, EN/JA/KO listing, admin authentication, sitemap, and correction intake.
8. Confirm private evidence remains private and public reads expose no draft, hidden, expired, or cross-market records.
9. Record actual recovery point and elapsed recovery time. The drill passes only when RPO is at most 24 hours and RTO is at most 12 hours.
10. Destroy the isolated drill deployment and database only after the reviewer signs off and required evidence is retained according to policy.
11. Update `reliability.restoreDrillDate` in `config/production-readiness.json` through a reviewed PR.

## Production recovery

During a real incident, first stop further damaging writes when safe, preserve logs and audit evidence, declare the incident owner, and select the recovery point. Restore into an isolated target and validate it before changing application connectivity or DNS. Any cutover requires explicit incident-owner approval and a documented rollback path.

## Evidence checklist

- Backup/PITR plan and retention confirmed
- Backup timestamp and selected recovery point
- Restore start/end timestamps
- RPO and RTO calculation
- Migration and extension inventory
- Contract-test and smoke-test results
- RLS/grant and public-leakage results
- Storage-reference validation
- Operator and reviewer sign-off
- Cleanup confirmation and follow-up actions
