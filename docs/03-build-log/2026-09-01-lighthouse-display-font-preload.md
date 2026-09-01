# Lighthouse display-font preload hardening

## Scope

- Removed the decorative Marcellus face from the critical preload path.
- Kept `display: optional` and the existing metric-compatible fallback so the
  first constrained render remains stable without changing the visual system.
- Preserved Marcellus for cached and sufficiently fast visits.

## Reason

The merged-main five-sample Lighthouse gate measured homepage LCP at 2,517 ms,
17 ms above the 2,500 ms budget, on two consecutive attempts. All 48 browser
tests and the accessibility, best-practices, and page-weight budgets passed.

## Verification

- TypeScript and lint pass locally.
- Optimized production build passes locally.
- The authoritative Lighthouse measurement runs in Node 24 CI; the local
  workstation currently provides Node 22 and could not keep the Lighthouse
  browser control socket open.

