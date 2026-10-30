# Phase 0 assisted updates

**Branch:** `codex/phase0-assisted-updates`

Implemented the Phase 0 manual assisted-update workflow required by PRD D11. Authorized operations and editorial staff can retain an inbound vendor email or SMS as restricted evidence, create a linked correction atomically, track the one-business-day response target, and record that a response was sent. The workflow does not send email or SMS, connect an external inbox, apply listing changes directly, or add Phase 1 vendor accounts.

The new evidence table is protected by row-level security. Direct mutations are denied; intake and response attribution run through guarded database functions. Contact details and message contents remain available only to authorized staff and are excluded from duplicated audit snapshots. The administrative screen includes empty, error, overdue, desktop, and mobile states and links each message to its correction review.

Verification completed before handoff:

- TypeScript typecheck passed.
- ESLint passed.
- Unit suite passed: 276 tests.
- Clean local database migration replay passed.
- Full database suite passed: 358 tests, including the generated role-by-table security matrix.
- Focused assisted-update database suite passed: 3 tests.

The production build was retried after stopping the local Supabase stack to reduce memory pressure. Compilation completed and TypeScript validation started, but the final build result was not captured before handoff. The browser test is implemented but still needs to be run on the better-resourced workstation. No staging or production resources were changed.
