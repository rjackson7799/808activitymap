# Phase 0 admin language QA queues

Implemented the PRD §10/§11 and TSD §10 Japanese and Korean translation-review workspace.

## Delivered

- Separate `/admin/qa/ja` and `/admin/qa/ko` queues for pending listing and menu locales.
- Configured SLA, oldest-item age, unassigned capacity, active work, and overdue visibility.
- Durable self-assignment plus start/pause/complete WorkSession timing with actor and active minutes.
- English-reference comparison for listing copy and private source-document access for menus.
- Own-locale editing for listing fields, menu sections, and menu items, including explicit human confirmation.
- Guarded approve/rework decisions that reuse the existing listing/menu state machines and immutable audit log.
- Matching-language reviewer isolation; publisher/super-admin step-up; editor/ops monitoring remains read-only.
- Korean QA operations are active while Korean public serving remains disabled by `locale_availability`.

## Verification

- Production build and TypeScript passed.
- 32 unit files / 262 tests passed.
- 28 database files / 342 tests passed after a clean migration replay.
- 56 browser tests passed, including real reviewer assignment/edit/timer/approval, read-only monitoring, mobile layout, and axe accessibility coverage.

No Phase 1 vendor portal, automated translation job, or Korean public launch capability was added.
