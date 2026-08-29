# Design-system implementation — 2026-08-28

Tags: #project-specific #build-log

## Goal

Apply `docs/design.md` to the shared public foundation and current public screens without importing prototype-only or future functionality. Verify English and Japanese desktop/mobile presentation and deploy only to staging.

## Work completed

- Audited the design guide against the PRD/TSD and the current route tree; recorded adopted and excluded patterns in `docs/06-design-system/2026-08-28-public-design-audit.md`.
- Added locale-specific Noto Sans font variables while preserving the English Marcellus/Plus Jakarta pairing.
- Refined the shared public backdrop, content surfaces, language menu, touch targets, focus behavior, cards, photo rendering, editorial note, and footer.
- Reworked home, category, and listing-detail layouts for the guide's visual hierarchy at mobile and desktop sizes.
- Mapped the mobile sticky CTA to the existing directions behavior rather than adding itinerary state.
- Extended public acceptance coverage for the language menu, 390px overflow, touch-target height, Japanese font resolution, and desktop rendering.

## Verification

- TypeScript and ESLint passed.
- Unit suite passed: 17 files, 193 tests.
- Optimized Next.js production build passed.
- Public Playwright acceptance passed: 8 tests, including axe checks on home/category/listing and the open language menu.
- Responsive assertions passed at 390×844 and 1440×900 with no horizontal overflow.
- Japanese H1 resolved to Noto Sans JP; the mobile Japanese layout was visually inspected.
- Desktop listing detail was visually inspected. Unavailable seed photo URLs now preserve the warm placeholder without broken-image glyphs, and a two-photo mosaic fills both columns.
- Staging Preview deployment attempted from immutable commit `364a9fd7cb0148a7ef194efae3996673eb818238`.
- Vercel deployment `dpl_BpvgoF4R1sWreGur4bn1RA1ZLic1` failed during page-data collection before publication: the remote builder reported the hosted Supabase JWT as issued in the future.
- A clean local Vercel prebuild using the pulled Preview configuration also failed before upload because the Preview-scoped Supabase service credential was rejected as an invalid API key.
- No production target, alias, database, hosted setting, or secret was changed. The temporary clean checkout and its downloaded Preview environment file were removed.
- Staging review remains blocked until the Preview Supabase service credential is corrected or rotated under the staging runbook's hosted-settings approval gate.
