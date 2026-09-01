# Verified Local badge contract

Date: 2026-09-01  
Tags: #project-specific #phase-0 #public-trust

## Scope

Aligned the public `Verified Local` badge with PRD D15. A listing now earns the badge only when approved, current provenance covers its name, address, map location, phone, hours, primary category, and at least one attached photo's usage rights.

## Decisions

- Kept badge eligibility separate from publication eligibility. Missing or stale badge evidence changes the trust chip but never auto-unpublishes an otherwise eligible listing.
- Added `verified`, `stale`, and `incomplete` badge states. English, Japanese, and Korean chrome describe the non-verified states without making a verification claim.
- Treated attached photo rights as an any-current set: one fresh, rights-cleared photo satisfies the photo requirement even if another attached photo is stale.
- Kept the public freshness summary concise; the full evidence set drives badge eligibility without exposing internal provenance details or producing duplicate generic labels.
- Extended the permissioned dossier loader through a forward-only wrapper so new dossiers record the complete badge evidence set while preserving the existing role, MFA, evidence, and publication checks.

## Verification

- Type checking and lint pass.
- Unit coverage verifies complete, missing, stale, and multiple-photo badge states.
- The full local migration chain and seed complete successfully.
- Database coverage verifies the seven required evidence facts and the public DTO's verified result.
- The production build and 45-test browser suite pass, including desktop/mobile layout, English/Japanese typography, accessibility, no-JavaScript rendering, and public leakage checks.
