# Permissioned listing seeding

This runbook creates Phase 0 listing drafts from a business's own website and upgrades them only after in-person verification and written permission. It never scrapes third-party directories and never bypasses MFA, QA, provenance, photo rights, or the existing publication contract.

## Release boundary

- Use local or staging only until production infrastructure is explicitly approved.
- A `load` never publishes. It leaves the English locale in `qa_pending` for review.
- A `stage-ja` never serves translated copy. It leaves Japanese in `machine_draft` until a reviewer submits and approves it.
- A `stage-ko` never serves translated copy. It leaves Korean in `machine_draft` until the named Korean reviewer submits and approves it.
- Publishing remains a separate MFA-gated admin action after `check` is clean.
- Do not add self-service claims, menus, deals, or machine translation to a dossier.

Menus use the separate permissioned workflow in `docs/runbooks/menu-seeding.md`; they are intentionally not embedded in the listing dossier.

## Operator prerequisites

1. Use a publisher or super-admin account with a verified TOTP factor.
2. Set `SEED_OPERATOR_EMAIL` and `SEED_OPERATOR_PASSWORD` outside source control. The CLI prompts for the one-time MFA code; `SEED_OPERATOR_TOTP_CODE` is supported only for short-lived automation.
3. Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` point to the intended local or staging project.
4. Keep real dossiers, signed permission forms, and photos in an access-controlled operations workspace. Commit only sanitized examples to this repository.

## Workflow

1. Build a pursuit list from founder knowledge or an authoritative public registry; do not import third-party listing content.
2. Keep one dossier per listing in an access-controlled operations directory. Before any database work, run the read-only launch audit:

   `npm run seed:inventory -- path/to/dossiers`

   The audit recursively validates YAML dossiers and local evidence files. The first pre-visit run is expected to report confirmation and media blockers; `READY` is required only before the final confirmed launch batch. It blocks on inventory outside the 25–40 launch target, invalid or duplicate IDs/slugs, missing in-person confirmation, missing licensed photos, missing Japanese content, and missing or unsupported photo/permission files. It reports Korean listing coverage without requiring Korean for every seeded business; the separate launch gate requires complete Korean coverage for founding vendors. It performs no authentication, uploads, or database writes. Use `npm run --silent seed:inventory:json -- path/to/dossiers` for a durable machine-readable report; sanitized output may be attached to a release review, but private paths and agreement details must not be committed.
3. Draft the dossier from the business's own HTTPS website. Keep `verification.confirmed: false`.
4. Validate without authentication or writes:

   `npm run seed:listings -- load path/to/dossier.yaml --dry-run`

5. Load the unconfirmed draft into local or staging:

   `npm run seed:listings -- load path/to/dossier.yaml`

6. Confirm name, address, coordinates, phone, hours, category, and editorial framing in person. Obtain the signed permission form and licensed original photo files.
7. Add photos and replace the verification block with:

   ```yaml
   verification:
     confirmed: true
     permission_form: ./private/vendor-permission.pdf
     granted_by: Vendor representative name
     verified_at: 2026-08-29T20:00:00Z
   ```

8. Rerun the inventory audit and the dossier dry run, then `load`. Files use content-addressed immutable Storage paths; the relational dossier upsert is atomic and deterministic.
9. Review the English locale, then record QA approval through the same MFA-gated state machine used by the admin application:

   `npm run seed:listings -- approve-en path/to/dossier.yaml`
10. Check publication readiness:

   `npm run seed:listings -- check path/to/dossier.yaml`

11. Publish only when `check` reports `READY`:

    `npm run seed:listings -- publish path/to/dossier.yaml`

    The command checks readiness again immediately before invoking the existing MFA-gated publication function. It cannot force publication past a blocker.

## Japanese follow-on

Add `locales.ja` only after the English dossier is confirmed. Japanese requires an explicit native canonical slug and complete reviewed SEO/editorial fields:

```yaml
locales:
  en: # existing reviewed English block
    # ...
  ja:
    name: サンプルカフェ
    slug: サンプルカフェ
    editorial_note: 現地で確認済みです。
    seo_title: サンプルカフェ
    seo_desc: ワイキキのサンプルカフェです。
```

Use the authenticated identity appropriate to each step. A publisher or super-admin with MFA stages and publishes; a Japanese reviewer may perform the review transitions with their own account.

1. Stage non-serving translated copy:

   `npm run seed:listings -- stage-ja path/to/dossier.yaml`

2. Submit the machine draft for review:

   `npm run seed:listings -- submit-ja path/to/dossier.yaml`

3. After human Japanese review, record approval:

   `npm run seed:listings -- approve-ja path/to/dossier.yaml`

4. Confirm the locale-specific publication contract is clean:

   `npm run seed:listings -- check-ja path/to/dossier.yaml`

5. Publish Japanese with a fresh readiness check:

   `npm run seed:listings -- publish-ja path/to/dossier.yaml`

Staging is idempotent when the dossier content is unchanged. Once review begins, changed content is rejected instead of silently overwriting approved or published Japanese copy; revisions must return through a reviewed editorial workflow.

## Korean follow-on

Add `locales.ko` only after the English dossier is confirmed. Korean requires an explicit native canonical slug and complete reviewed SEO/editorial fields:

```yaml
locales:
  en: # existing reviewed English block
    # ...
  ko:
    name: 샘플 카페
    slug: 샘플-카페
    editorial_note: 현장에서 확인되었습니다.
    seo_title: 샘플 카페
    seo_desc: 와이키키의 샘플 카페입니다.
```

The technical workflow is available before staffing is complete, but Korean approval and publication remain operationally blocked until the named Korean reviewer and backup are confirmed.

1. Stage non-serving translated copy:

   `npm run seed:listings -- stage-ko path/to/dossier.yaml`

2. Submit the machine draft for review:

   `npm run seed:listings -- submit-ko path/to/dossier.yaml`

3. After human Korean review, record approval:

   `npm run seed:listings -- approve-ko path/to/dossier.yaml`

4. Confirm the locale-specific publication contract is clean:

   `npm run seed:listings -- check-ko path/to/dossier.yaml`

5. Publish Korean with a fresh readiness check:

   `npm run seed:listings -- publish-ko path/to/dossier.yaml`

As with Japanese, unchanged staging is idempotent and reviewed content cannot be silently overwritten. This listing workflow does not create or translate Korean menus; menu coverage remains separately measured by the production launch gate.

## Expected blockers

- An unconfirmed dossier reports missing approved provenance and usually missing photo/QA blockers.
- A confirmed dossier still reports `locale_status_insufficient` until English QA approval.
- Japanese reports `locale_status_insufficient` until the staged machine draft completes Japanese QA.
- Korean reports `locale_status_insufficient` until the staged machine draft completes Korean QA.
- Missing or unmoderated photos, incomplete rights, unknown categories, expired provenance, and incomplete core fields remain blocking.

## Safety and recovery

- Deterministic entity IDs make a retry update the same organization, location, hours, listing, and locale rather than duplicate them.
- Storage keys include the file hash. Replacing bytes creates a new immutable object path.
- A failed relational load may leave an unattached immutable Storage object. Record it for a reviewed cleanup; never overwrite or delete objects ad hoc.
- `check` is read-only. `--dry-run` performs no authentication, upload, or database write.
