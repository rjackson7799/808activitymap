# Phase 0 staging reliability audit — 2026-08-30

The linked staging Supabase project was audited through supported read-only provider tooling after schema parity was established. Its backup inventory reported WALG enabled, PITR disabled, and no earliest or latest recoverable timestamp. This is staging evidence only and does not satisfy the production requirements for verified daily backups, an eligible PITR plan, or a completed isolated restore drill.

The hosted signup setting remains an explicit staging hardening check. The repository's local configuration is not safe to push to the hosted project because it contains local redirect URLs, and the installed CLI exposes configuration push but no configuration read-back. Dashboard verification is therefore still required; no configuration was guessed or overwritten.

No backup restore, project reset, content seed, auth configuration change, production resource, or production deployment was performed.
