import { describe, expect, it } from "vitest";
import { withRollback, expectErrorIn } from "./helpers";
import { MEDIA, MENU } from "./fixtures";

/**
 * Menu-evidence conditional constraint (migration 11): {approved, published}
 * — or approval_type vendor_approved_external — REQUIRE evidence media
 * (kind=evidence) + approver + timestamp + rights on the source media.
 */

describe("evidence constraint trigger", () => {
  it("rejects approving a locale without any evidence payload", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /menu_evidence_missing/, (sp) =>
        sp`update menu_version_locales set status = 'approved', approval_type = 'portal'
           where id = ${MENU.mvlKo}`,
      );
    });
  });

  it("rejects publishing without evidence", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /menu_evidence_missing/, (sp) =>
        sp`update menu_version_locales set status = 'published' where id = ${MENU.mvlKo}`,
      );
    });
  });

  it("rejects vendor_approved_external at ANY status without evidence", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /menu_evidence_missing/, (sp) =>
        sp`update menu_version_locales set approval_type = 'vendor_approved_external'
           where id = ${MENU.mvlKo}`,
      );
    });
  });

  it("rejects evidence media of the wrong kind (photo is not evidence)", async () => {
    await withRollback(async (tx) => {
      await expectErrorIn(tx, /must be kind=evidence/, (sp) =>
        sp`update menu_version_locales
           set status = 'approved', approval_type = 'vendor_approved_external',
               approval_evidence_media_id = ${MEDIA.ramenPhoto1},
               approved_by = '99000000-0000-4000-8000-000000000002',
               approved_at = now()
           where id = ${MENU.mvlKo}`,
      );
    });
  });

  it("rejects approval when the source media lacks a rights record", async () => {
    await withRollback(async (tx) => {
      await tx`set local session_replication_role = 'replica'`;
      await tx`update media set rights = null where id = ${MEDIA.ramenMenuSource}`;
      await tx`set local session_replication_role = 'origin'`;
      await expectErrorIn(tx, /menu_rights_unlinked/, (sp) =>
        sp`update menu_version_locales
           set status = 'approved', approval_type = 'vendor_approved_external',
               approval_evidence_media_id = ${MEDIA.ramenEvidenceEn},
               approved_by = '99000000-0000-4000-8000-000000000002',
               approved_at = now()
           where id = ${MENU.mvlKo}`,
      );
    });
  });

  it("accepts a complete evidence payload", async () => {
    await withRollback(async (tx) => {
      await tx`update menu_version_locales
               set status = 'approved', approval_type = 'vendor_approved_external',
                   approval_evidence_media_id = ${MEDIA.ramenEvidenceEn},
                   approved_by = '99000000-0000-4000-8000-000000000002',
                   approved_at = now()
               where id = ${MENU.mvlKo}`;
      const row = await tx`select status from menu_version_locales where id = ${MENU.mvlKo}`;
      expect(row[0]!.status).toBe("approved");
    });
  });

  it("workflow statuses before approval do not require evidence", async () => {
    await withRollback(async (tx) => {
      await tx`update menu_version_locales set status = 'qa_pending' where id = ${MENU.mvlKo}`;
      await tx`update menu_version_locales set status = 'qa_approved' where id = ${MENU.mvlKo}`;
      const row = await tx`select status from menu_version_locales where id = ${MENU.mvlKo}`;
      expect(row[0]!.status).toBe("qa_approved");
    });
  });
});
