# Phase 0 permissioned seeding harness — 2026-08-29

Implemented the first launch-inventory tooling slice: validated YAML dossiers, deterministic entity IDs, content-addressed uploads, MFA-authenticated loading, pending-versus-approved provenance, private permission evidence, read-only readiness checks, and an operator runbook.

The repository's current authorization contract is stricter than the early design note: locale authoring and QA transitions require publisher/super-admin AAL2. The harness preserves that stronger boundary. It does not publish, seed real businesses, add future product features, or access production.
