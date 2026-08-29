# Public design audit — 2026-08-28

Tags: #project-specific #design-system

## Authority and scope

This audit compares the current public application with `docs/design.md`. The design guide controls visual language; the PRD and TSD continue to control product behavior and delivery order.

The current product slice exposes three public screen types: home/browse, category results, and listing detail. These screens and their shared header, footer, language control, cards, typography, status, menu, hours, location, and provenance surfaces are the implementation scope for this pass.

## Patterns adopted now

- Warm sand backdrop, shell content surfaces, white cards, ink text, teal actions, clay editorial accents, hairline borders, restrained shadows, and 18px content-card radii.
- Marcellus display type plus Plus Jakarta Sans UI type for English.
- Noto Sans JP and Noto Sans KR replacing both display and UI roles for their locales.
- A compact globe language menu with native locale names, active-state checkmark, and content-sized rows.
- Photo-forward result cards, mobile vertical cards, and the desktop listing photo mosaic.
- A responsive listing-detail composition with a primary content column and 300px action/hours/location rail on desktop.
- The prototype's clay Kama‘āina note treatment, mapped to the repository's approved per-locale editorial note.
- The teal location card and mobile sticky action pattern, mapped to the existing directions action.
- Minimum 36px interactive targets, a localized skip link, visible focus, reduced-motion handling, flexible labels, and overflow checks.

## Intentionally excluded

- Presenter controls and device frame: prototype scaffolding.
- Search: explicitly deferred in Phase 0/1.
- Itinerary state, drawer, drag-and-drop, day tabs, and route line: not part of the current slice and not authorized by the repository roadmap.
- Interactive map tiles, live proximity, and ETA: current scope is static/link-out maps and has no location-permission flow.
- Ratings and review quotes: third-party review ingestion is prohibited and first-party reviews are backlog.
- Deal modal and “Mark as redeemed”: Slice 7 is not implemented; the repository requires server-validated deal reveals, not prototype redemption claims.
- Saved state, consumer accounts, and favorites: explicitly out of scope.
- Future `/today`, `/trust`, `/deals`, and `/for-business` screens: they are roadmap items but do not exist in the current application slice, so this visual pass does not invent their functionality.

## Pre-implementation gaps found

- Japanese and Korean inherited system fallbacks instead of the specified locale-specific Noto families.
- The language switcher displayed all locales as pills instead of the guide's compact menu and had sub-36px targets.
- Listing cards and the listing photo gallery ignored approved photo URLs.
- Desktop detail content was a single narrow column rather than the guide's main-plus-sidebar composition.
- The editorial note did not carry the distinctive localized Kama‘āina label treatment.
- Responsive behavior had basic grids but no explicit 390px overflow or locale-font verification.

## Product-preserving adaptations

The design's itinerary CTA was replaced by the existing directions action on mobile. The detail sidebar uses current share, call, live-hours, structured weekly hours, location, and directions data. No new state model, public data field, write path, entitlement, or analytics contract was introduced.
