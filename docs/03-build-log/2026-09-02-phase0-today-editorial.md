# Phase 0 weekly editorial

Date: 2026-09-02

## Scope

Implemented the current Phase 0 weekly `/today` editorial surface and its staff workflow. The slice uses existing published listings and the currently served English and Japanese locales. It deliberately excludes personalization, user accounts, automated recommendations, Korean publication before its existing readiness gate, and other future editorial products.

## Product contract

- Public visitors can open a localized “This week” page with a dated editorial note and an ordered shortlist of one to six existing listings.
- The route has an intentional localized empty state when no edition is live, so navigation remains stable between editions.
- English uses the root canonical URL and Japanese uses `/ja`; canonical alternates and sitemap entries follow the existing locale contract.
- The note and shortlist render without JavaScript. A `today_note_view` event records the note after one second of visibility without blocking the page.
- Staff can create a Monday-based edition, prepare localized copy, select and order its shortlist, review locale copy, publish, or archive from the Admin “This week” workspace.
- Publication requires current MFA, publisher or super-admin authority, approved English and Japanese copy, and listings that are publishable in both served locales.

## Safety and operations

- Editorial data is scoped to the existing Waikīkī market, protected by row-level security, unavailable through direct browser-table access, and managed through guarded database functions.
- Locale reviewers can see and change only their assigned language. Editors manage English and shortlist content; publishers and super-admins control release.
- Publishing atomically archives the previous edition for the same market, publishes the selected edition, and records all mutations in the audit log.
- Demo copy remains local/CI seed data only. Staging and production content must be created through the staff workflow.

## Verification

- Clean replay of all database migrations and regenerated row-level-security policies.
- TypeScript and lint checks passed.
- 274 unit tests and 355 database tests passed.
- 60 browser scenarios passed, including admin accessibility, English/Japanese typography, mobile overflow, no-JavaScript rendering, sitemap exposure, analytics capture, and public data-leakage guards.
- Five-sample mobile performance audit passed: 0.99 performance, 1.00 accessibility, 1.00 best practices, 2,032 ms median LCP, and 227 KB median page weight.
