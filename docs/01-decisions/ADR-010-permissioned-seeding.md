# ADR-010: permissioned first-party seeding

**Status:** Accepted  
**Tags:** #portable #project-specific

## Decision

Seed launch inventory through validated dossiers sourced from each business's own website, followed by in-person verification, written permission, and licensed photos. Do not scrape or cache third-party listing content.

The loader uses deterministic IDs and immutable content-addressed Storage paths. It authenticates as a real publisher or super-admin and requires AAL2. A guarded database function performs the relational upsert atomically, records pending or approved provenance, and links approved facts to private permission evidence. It leaves locale content in `qa_pending`; QA and publication remain separate guarded actions.

## Why

The product's advantage is trustworthy first-party data. A service-role import would weaken the exact controls the portal promises. The authenticated workflow is slightly slower, but preserves role, MFA, audit, provenance, rights, and publication boundaries while making the 25–40 listing launch inventory repeatable.

## Consequences

- Operators need a real MFA-enabled publishing identity.
- Real dossiers and evidence require a private operations workspace.
- Storage upload and relational commit cannot share one transaction; failed loads can leave unattached immutable objects that require reviewed cleanup.
- Self-service claims, translation, menus, and deals remain separate later slices.
