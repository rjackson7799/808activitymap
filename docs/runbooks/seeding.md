# Permissioned listing seeding

This runbook creates Phase 0 listing drafts from a business's own website and upgrades them only after in-person verification and written permission. It never scrapes third-party directories and never bypasses MFA, QA, provenance, photo rights, or the existing publication contract.

## Release boundary

- Use local or staging only until production infrastructure is explicitly approved.
- A `load` never publishes. It leaves the English locale in `qa_pending` for review.
- Publishing remains a separate MFA-gated admin action after `check` is clean.
- Do not add self-service claims, menus, deals, or machine translation to a dossier.

## Operator prerequisites

1. Use a publisher or super-admin account with a verified TOTP factor.
2. Set `SEED_OPERATOR_EMAIL` and `SEED_OPERATOR_PASSWORD` outside source control. The CLI prompts for the one-time MFA code; `SEED_OPERATOR_TOTP_CODE` is supported only for short-lived automation.
3. Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` point to the intended local or staging project.
4. Keep real dossiers, signed permission forms, and photos in an access-controlled operations workspace. Commit only sanitized examples to this repository.

## Workflow

1. Build a pursuit list from founder knowledge or an authoritative public registry; do not import third-party listing content.
2. Draft the dossier from the business's own HTTPS website. Keep `verification.confirmed: false`.
3. Validate without authentication or writes:

   `npm run seed:listings -- load path/to/dossier.yaml --dry-run`

4. Load the unconfirmed draft into local or staging:

   `npm run seed:listings -- load path/to/dossier.yaml`

5. Confirm name, address, coordinates, phone, hours, category, and editorial framing in person. Obtain the signed permission form and licensed original photo files.
6. Add photos and replace the verification block with:

   ```yaml
   verification:
     confirmed: true
     permission_form: ./private/vendor-permission.pdf
     granted_by: Vendor representative name
     verified_at: 2026-08-29T20:00:00Z
   ```

7. Run the dry run again, then `load`. Files use content-addressed immutable Storage paths; the relational dossier upsert is atomic and deterministic.
8. Review the English locale and advance it through the existing QA workflow.
9. Check publication readiness:

   `npm run seed:listings -- check path/to/dossier.yaml`

10. Publish only when `check` reports `READY`, using the existing MFA-gated admin workflow.

## Expected blockers

- An unconfirmed dossier reports missing approved provenance and usually missing photo/QA blockers.
- A confirmed dossier still reports `locale_status_insufficient` until English QA approval.
- Missing or unmoderated photos, incomplete rights, unknown categories, expired provenance, and incomplete core fields remain blocking.

## Safety and recovery

- Deterministic entity IDs make a retry update the same organization, location, hours, listing, and locale rather than duplicate them.
- Storage keys include the file hash. Replacing bytes creates a new immutable object path.
- A failed relational load may leave an unattached immutable Storage object. Record it for a reviewed cleanup; never overwrite or delete objects ad hoc.
- `check` is read-only. `--dry-run` performs no authentication, upload, or database write.
