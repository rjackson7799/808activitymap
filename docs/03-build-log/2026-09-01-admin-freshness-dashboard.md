# Admin freshness dashboard

Date: 2026-09-01  
Tags: #project-specific #phase-0 #operations

## Scope

Added the read-only Phase 0 freshness workspace at `/admin/freshness`. It gives authenticated staff a listing-level view of current, approved provenance across listings, locations, localized content, hours, media, and menus.

## Decisions

- Reused the public surface's threshold and expiration rule instead of creating a second staleness implementation.
- Kept the workspace read-only. Editing freshness thresholds or provenance would expand the operational risk and is not required for this slice.
- A published listing with no current approved provenance is flagged for attention, while individual missing fields are not inferred. Publication gates remain authoritative for field completeness.
- Stale facts remain published and are flagged for review, matching D15.

## Verification

- Unit coverage pins field-to-threshold mapping, explicit expiration, and the threshold boundary.
- The authenticated admin accessibility suite includes the new route.
- The mobile suite checks the dashboard at 390 px for horizontal overflow.
