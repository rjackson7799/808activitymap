# Phase 0 affiliate clickouts

Date: 2026-09-01

## Scope

Implemented the tracked-link portion of PRD Slice 7 for current public listing pages. This slice deliberately excludes activity taxonomy exposure, bookings, partner APIs, sponsored placement products, vendor self-service, and deeper integrations.

## Product contract

- Editors, publishers, and super-admins can add, hide, and restore partner links from the existing Deals workspace with current MFA.
- Public listing pages render an optional EN/JA localized “Explore nearby” module. The entire module is omitted when no active links exist.
- Every module carries an explicit affiliate disclosure and every link uses `rel="sponsored"`.
- Destination URLs remain out of the public DTO and page source. Public controls point to the first-party `/api/out/:id` endpoint.
- The redirect validates that the link is active and the requested listing locale is currently publishable, records `affiliate_clickout` server-side with partner and context, and issues a non-cacheable 302.
- Configured `affiliate_module_ordering` keys lead; unconfigured links retain staff sort order.

## Safety and operations

- Browser roles cannot read the affiliate table or destination URLs directly. Management is limited to guarded functions and audited changes.
- Both the admin action and database RPC reject non-HTTPS, credentialed, custom-port, localhost, private, and reserved literal destinations.
- The weekly health checker resolves hosts before connecting, rejects private/reserved DNS answers, validates every redirect hop, and never forwards credentials.
- A link is marked dead and disappears from public pages after two consecutive failed checks. Health changes and staff hide/restore actions invalidate the affected public cache.
- Analytics/config failures are fail-safe: a valid partner redirect still works even if event recording is temporarily unavailable.

## Verification

- Clean replay of all database migrations.
- Focused unit tests cover URL safety, IPv4/IPv6 classification, event source enforcement, and configured ordering.
- Focused database tests cover MFA/role guards, public-locale resolution, private destination rejection, health auto-hide, RLS, public reads, and audit coverage.
- Browser journey covers admin creation, server-rendered EN/JA content, disclosure, measured 302, mobile layout, accessibility, immediate hide invalidation, and hidden-link 404 behavior.
