# Phase 0 seeding publication lifecycle — 2026-08-29

Completed the permissioned dossier lifecycle with explicit English QA approval and publication commands. Both authenticate as a real operator, require AAL2, and call the existing guarded state transitions. Publication performs a fresh readiness check immediately before the publish RPC and exits without writing when any blocker remains.

The integration contract now covers confirmed dossier load → private evidence link → English QA approval → zero blockers → publication. No service-role shortcut, auto-approval, real vendor data, or production operation was added.
