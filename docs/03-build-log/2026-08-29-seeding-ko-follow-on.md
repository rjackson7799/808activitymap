# Phase 0 seeding Korean follow-on — 2026-08-29

Extended the permissioned dossier workflow with an optional Korean locale block and explicit stage, submit, approve, readiness-check, and publish commands. Korean content begins as a non-serving `machine_draft`; staging requires a confirmed first-party listing, publisher or super-admin authorization, and AAL2. Publication continues through the existing locale-specific QA state machine and guarded publication contract.

The launch inventory audit now reports Korean listing coverage and checks Korean slug uniqueness without requiring Korean for every seeded listing. The Phase 0 production gate remains authoritative: founding-vendor Korean coverage, Korean menu coverage, and named reviewer staffing are separate operational requirements and are not inferred by this implementation.

No translation generation, reviewer assignment, real vendor content, menu translation, production configuration, or production deployment was added.
