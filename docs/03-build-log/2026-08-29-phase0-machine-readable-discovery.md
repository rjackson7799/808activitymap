# Phase 0 machine-readable discovery — 2026-08-29

## Scope

Completed the remaining current-scope discovery implementation without adding the deferred public JSON feed or future product features.

## Delivered

- Added an environment-branded `/llms.txt` with canonical English, Japanese, trust, correction, and sitemap links.
- Kept all non-production environments fail-closed to crawlers and extracted the robots policy into a directly tested builder.
- Preserved the production crawler allowlist and canonical sitemap/host directives.
- Added schema.org `ItemList` and `BreadcrumbList` JSON-LD to category pages using the same publishability-gated DTO rendered to visitors.
- Centralized safe JSON-LD serialization so user-authored text cannot close a script element.
- Extended browser acceptance coverage across `llms.txt`, robots, sitemap locale rules, and category structured data.

## Verification

- Typecheck: passed.
- Lint: passed.
- Unit: 212 passed.
- Database/schema: 328 passed, including existing schema goldens and sitemap eligibility tests.
- Browser: 44 passed, including desktop/mobile layout, EN/JA typography, accessibility, JS-free rendering, and public leakage checks.
- Production build: passed and emitted `/llms.txt`, `/robots.txt`, and `/sitemap.xml` as revalidated routes.

## Release status

The implementation is ready for staging review. `publicTrust.llmsTxtVerified` remains `false`: the production gate requires verification on the approved final brand/domain, and this work does not authorize or perform a production deployment.
