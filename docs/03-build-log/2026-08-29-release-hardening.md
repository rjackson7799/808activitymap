# Release hardening — 2026-08-29

**Branch:** `codex/release-hardening`
**Scope:** pre-production hardening only; no production deployment or promotion

## Implemented

- Upgraded Next.js and its ESLint configuration to 16.3.3, aligned local/CI runtime policy on Node 24, and resolved the dependency audit to zero known vulnerabilities.
- Added baseline response security headers for every route, with production CSP sources kept separate from local/test allowances.
- Added a blocking five-sample mobile Lighthouse gate for performance, accessibility, best practices, LCP, and total page weight. Invalid browser traces retry and are preserved as diagnostic artifacts.
- Reduced the public payload by keeping listing-only enhancements off browse routes, making body-font loading non-blocking on constrained networks, and avoiding the Japanese unicode-range webfont payload on English routes. Japanese retains the design-specified `Noto Sans JP` locale stack with native Japanese fallbacks.
- Kept all public content server-rendered. Share and open-now enhancements remain additive, and open-hours calculation runs in a worker. Client-navigation analytics semantics remain unchanged.

## Verification

- Typecheck and lint: passed.
- Unit: 15 files, 168 tests passed.
- Optimized production build: passed; all 25 static pages generated.
- Full browser suite during hardening: 40/41 initially passed; the sole analytics navigation regression was corrected.
- Final focused browser regression: 17/17 passed, covering analytics, routing, canonical/hreflang behavior, desktop/mobile fit, Japanese typography, structured data, and axe accessibility.
- Lighthouse five-run median: performance 0.98, accessibility 1.00, best practices 1.00, LCP 2,417 ms, total byte weight 210,872 bytes.
- Live local response: CSP, `nosniff`, strict referrer policy, permissions policy, same-origin opener policy, and frame denial confirmed.
- Dependency audit: zero known vulnerabilities.

## Remaining release blockers

- Confirm the final brand and production domain.
- Provision and validate production Vercel/Supabase configuration, backups, restore procedure, monitoring, and environment/branch protections.
- Expand approved launch inventory from the current two listings to the required launch set and provide the reference listing's complete photo fixture.
- Complete the current-scope trust/report-change and machine-readable discovery surfaces if they remain launch requirements.
- Run the reference-listing Moto G/full-photo Lighthouse check once the production-equivalent media fixture exists. The CI gate currently uses the reproducible homepage and may be pointed at that listing with `LIGHTHOUSE_PATH`.

Production remains untouched. These blockers require product/content or production-infrastructure decisions and were not inferred or built on this branch.
