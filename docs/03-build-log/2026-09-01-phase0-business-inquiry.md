# Phase 0 business inquiry

Date: 2026-09-01
Tags: #project-specific #phase-0 #public-trust

## Scope

Added the required Phase 0 `/for-business` and `/ja/for-business` public surfaces and a secure business-interest intake. The page explains the permissioned listing process, first-party accuracy standard, multilingual review boundary, and no-paid-ranking policy without introducing Phase 1 claims, accounts, memberships, billing, or self-service publishing.

## Decisions

- Treat an inquiry as an expression of interest only. The stored record cannot claim a listing, create an organization membership, authorize publication, or start a paid service.
- Keep Korean business onboarding unavailable until its PRD backlog slice. The database locale constraint remains aligned with the complete schema locale universe, while the public route and input schema serve only EN and JA.
- Protect contact details behind a server-only table with row-level security and no anonymous or authenticated grants. Public writes use the service boundary only after strict validation, explicit contact consent, same-origin validation, bot filtering, a honeypot, and configurable IP/session rate limits.
- Audit every record mutation under the repository-wide audit contract. Do not emit a product analytics event containing inquiry contact data.
- Link the page from the shared public footer so it is discoverable without changing the compact public header.

## Verification

- Input and configuration unit tests cover locale, bounds, URLs, consent, strict object shape, and runtime defaults.
- Database coverage verifies schema replay, audit coupling, locale agreement, denial of public/authenticated reads, bounded content, and separation from future claim and membership tables.
- Browser coverage verifies a real stored inquiry, EN/JA copy, canonical/hreflang metadata, Japanese typography, accessibility, desktop/mobile overflow, visible form controls, and Korean route exclusion.
