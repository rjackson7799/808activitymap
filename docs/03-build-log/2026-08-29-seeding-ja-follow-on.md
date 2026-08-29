# Phase 0 seeding Japanese follow-on — 2026-08-29

Extended the permissioned dossier workflow with an optional Japanese locale block and explicit stage, submit, approve, readiness-check, and publish commands. Staging requires a confirmed first-party listing, publisher or super-admin authorization, and AAL2. Japanese content begins as non-serving `machine_draft`; publication reuses the existing locale-specific QA state machine and guarded publication contract.

The staging RPC is idempotent for identical content and rejects changed content after review begins, preventing a dossier retry from silently altering QA-approved or published Japanese copy. No translation generation, Korean workflow, real vendor content, or production operation was added.
