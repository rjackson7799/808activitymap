# Lighthouse display-font stability

Date: 2026-09-01  
Tags: #project-specific #phase-0 #performance

## Scope

Stabilized the strict 2.5-second mobile homepage LCP gate after the verified-badge release. Functional E2E, database, unit, accessibility, and best-practices checks were already green; the isolated failure was a late display-font repaint on the homepage heading.

## Evidence and decision

- The retained five-run Lighthouse trace identified `Browse Waikīkī` as the LCP element, with an 8.5 ms TTFB and 75.7 ms element render delay. The remaining LCP time tracked the Marcellus font swap under simulated constrained networking.
- Marcellus remains preloaded and remains the normal/cached display face from the design system.
- `font-display: optional` lets a constrained first visit keep Next's adjusted metric-compatible fallback instead of repainting the heading after the LCP deadline.
- The LCP budget remains 2.5 seconds; no threshold was relaxed.
