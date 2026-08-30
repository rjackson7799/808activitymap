# Phase 0 permissioned menu seeding — 2026-08-30

Added a separate validated menu dossier and authenticated operator CLI for vendor-supplied menu sources. The loader uses deterministic relational identifiers, immutable content-addressed source/evidence objects, approved listing provenance, publisher/super-admin authorization, and AAL2. Locale content begins non-serving in `translation_pending`.

Database guards now require every dossier-seeded QA-approved, approved, or published locale to contain a human-confirmed name for every item and a localized name for every section, without changing the contract of legacy/manual fixtures. Explicit version numbers give later revisions new deterministic section, item, and locale identifiers while preventing reviewed content from being overwritten. Vendor approval retains the existing private evidence and source-rights requirements. Publishing activates the menu version; exact-locale status remains authoritative, so menu content and money never fall back across languages.

No scraping, translation generation, real vendor content, reviewer assignment, menu coverage claim, staging database write, production configuration, or production deployment was performed.
