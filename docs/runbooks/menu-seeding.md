# Permissioned menu seeding

This workflow adds a vendor-supplied menu to an already confirmed permissioned listing. It preserves the menu contract: prices are stored once, localized names never fall back from English, vendor approval requires private evidence, and no locale serves before its own human review and publication.

## Release boundary

- Use local or staging only until production infrastructure is approved.
- Do not scrape delivery apps, review platforms, or third-party directories.
- The source must be supplied or licensed by the vendor and uploaded with its rights record.
- `load` creates only `translation_pending` locale rows. It never serves a menu.
- `human_confirmed: true` means a qualified human checked that localized item against the source. Set it only after actual review.
- The Korean launch metric remains operational evidence: count seeded restaurant listings with a published Korean menu and divide by seeded restaurant listings. Do not mark the production gate complete from a successful tool run alone.

## Dossier shape

Keep menu dossiers and their private source/evidence files outside the repository. Section and item `ref` values are stable identifiers; do not change them merely to reorder content.

```yaml
listing_external_ref: sample-cafe
menu_ref: main-menu
version: 1
source:
  file: ./private/menu.pdf
  license: vendor-supplied
  granted_by: Vendor representative
  captured_at: 2026-08-30T00:00:00Z
approval:
  file: ./private/menu-approval.pdf
  license: vendor-approval
  granted_by: Vendor representative
sections:
  - ref: drinks
    position: 0
    items:
      - ref: kona-coffee
        position: 0
        price_cents: 500
        currency: USD
        price_type: fixed
        owner_pick: true
locales:
  en:
    sections:
      - ref: drinks
        name: Drinks
        items:
          - ref: kona-coffee
            original_name: Kona Coffee
            name: Kona Coffee
            description: Freshly brewed Kona coffee.
            human_confirmed: true
```

Every included locale must contain every section and item exactly once. `fixed` and `from` prices require `price_cents`; `market` prices must omit it.

## Workflow

1. Validate assets, references, prices, and deterministic identifiers without authentication or writes:

   `npm run seed:menus -- load path/to/menu.yaml --dry-run`

2. Load or refresh the non-serving draft with a publisher or super-admin AAL2 session:

   `npm run seed:menus -- load path/to/menu.yaml`

3. Before review begins, correct the dossier, mark genuinely reviewed items `human_confirmed: true`, and rerun `load`. Identical loads are idempotent. Changed content is rejected after review starts; increment `version` for a later revision. Keep the same `menu_ref` only while the underlying source capture is unchanged; use a new `menu_ref` for a newly supplied source menu.

4. For each included locale, submit, record language QA, record vendor approval evidence, check, and publish. For English:

   ```text
   npm run seed:menus -- submit-en path/to/menu.yaml
   npm run seed:menus -- approve-qa-en path/to/menu.yaml
   npm run seed:menus -- approve-vendor-en path/to/menu.yaml
   npm run seed:menus -- check-en path/to/menu.yaml
   npm run seed:menus -- publish-en path/to/menu.yaml
   ```

   Replace `en` with `ja` or `ko` for those locales. Japanese and Korean QA must be performed by their appropriate language reviewer. Publication remains publisher/super-admin plus AAL2.

Publishing the first locale activates the version. The public read path still requires that exact locale to be approved or published, so another locale cannot expose English item names or prices through fallback.

## Safety and recovery

- Menu source and approval evidence use immutable content-addressed Storage paths.
- The relational load is atomic and deterministic.
- A changed draft can be rebuilt only while every locale remains `translation_pending`.
- Reviewed or published content cannot be silently overwritten.
- A failed relational load may leave unattached immutable Storage objects. Record them for reviewed cleanup; do not overwrite or delete evidence ad hoc.
