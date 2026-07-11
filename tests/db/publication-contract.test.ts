import { describe, expect, it } from "vitest";
import { sql, withRollback, type TxSql } from "./helpers";
import { LISTING, LOC, MEDIA, MENU, blockerCodes, type Blocker } from "./fixtures";

/**
 * Publication-contract negatives (slice-1 DoD #3): every blocker code proven
 * by a failing state, then the passing path once resolved. Each case perturbs
 * the publishable reference fixture (listing A / ja) inside a rolled-back
 * transaction, so tests are independent and leave no residue.
 *
 * Blockers that schema constraints make unreachable through normal writes
 * (menu evidence, market mismatch) are provoked under
 * session_replication_role=replica — proving the gate catches corrupt state
 * even when triggers/FKs were bypassed (defense in depth).
 */

const gate = (tx: TxSql, listing: string = LISTING.ramen, locale = "ja") =>
  tx`select blocker_code, detail from can_publish_listing_locale(${listing}::uuid, ${locale})` as Promise<
    Blocker[]
  >;

describe("can_publish_listing_locale — baseline", () => {
  it("reference fixture A publishes clean in en and ja", async () => {
    const ja = await sql`select * from can_publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`;
    const en = await sql`select * from can_publish_listing_locale(${LISTING.ramen}::uuid, 'en')`;
    expect(ja).toEqual([]);
    expect(en).toEqual([]);
  });

  it("raises for a nonexistent listing", async () => {
    await expect(
      sql`select * from can_publish_listing_locale('00000000-0000-4000-8000-00000000dead'::uuid, 'ja')`,
    ).rejects.toThrow(/not found/);
  });

  it("raises for an unknown locale", async () => {
    await expect(
      sql`select * from can_publish_listing_locale(${LISTING.ramen}::uuid, 'fr')`,
    ).rejects.toThrow(/unknown locale/);
  });
});

describe("blocker: missing_required_field", () => {
  const fieldCases: Array<{ field: string; break_: (tx: TxSql) => Promise<unknown>; fix: (tx: TxSql) => Promise<unknown> }> = [
    {
      field: "name",
      break_: (tx) =>
        tx`update listing_locales set name = null where listing_id = ${LISTING.ramen} and locale = 'ja'`,
      fix: (tx) =>
        tx`update listing_locales set name = 'アロハ・ラーメン・ハレ' where listing_id = ${LISTING.ramen} and locale = 'ja'`,
    },
    {
      field: "slug",
      break_: (tx) =>
        tx`update listing_locales set slug = null where listing_id = ${LISTING.ramen} and locale = 'ja'`,
      fix: (tx) =>
        tx`update listing_locales set slug = 'アロハラーメンハレ' where listing_id = ${LISTING.ramen} and locale = 'ja'`,
    },
    {
      field: "address",
      break_: (tx) => tx`update locations set address = null where id = ${LOC.ramen}`,
      fix: (tx) =>
        tx`update locations set address = '{"street":"2250 Demo Ave"}'::jsonb where id = ${LOC.ramen}`,
    },
    {
      field: "hours",
      break_: (tx) => tx`delete from hours_sets where location_id = ${LOC.ramen}`,
      fix: (tx) =>
        tx`insert into hours_sets (location_id, weekly, unknown) values (${LOC.ramen}, '{}'::jsonb, true)`,
    },
    {
      field: "primary_category",
      break_: (tx) =>
        tx`update listings set primary_category_id = null where id = ${LISTING.ramen}`,
      fix: (tx) =>
        tx`update listings set primary_category_id = 'e0000000-0000-4000-8000-000000000011' where id = ${LISTING.ramen}`,
    },
    {
      field: "photo",
      break_: (tx) => tx`delete from listing_media where listing_id = ${LISTING.ramen}`,
      fix: (tx) =>
        tx`insert into listing_media (listing_id, media_id) values (${LISTING.ramen}, ${MEDIA.ramenPhoto1})`,
    },
  ];

  it.each(fieldCases)(
    "fires for missing $field, clears once resolved",
    async ({ field, break_, fix }) => {
      await withRollback(async (tx) => {
        await break_(tx);
        const blocked = await gate(tx);
        expect(blockerCodes(blocked)).toContain("missing_required_field");
        expect(
          blocked.some(
            (b) => b.blocker_code === "missing_required_field" && b.detail.field === field,
          ),
        ).toBe(true);

        await fix(tx);
        const resolved = await gate(tx);
        expect(
          resolved.filter(
            (b) => b.blocker_code === "missing_required_field" && b.detail.field === field,
          ),
        ).toEqual([]);
      });
    },
  );
});

describe("blocker: locale_status_insufficient", () => {
  it.each(["not_started", "machine_draft", "qa_pending", "vendor_review_pending", "stale", "withdrawn"])(
    "fires for status %s, clears at qa_approved",
    async (status) => {
      await withRollback(async (tx) => {
        await tx`update listing_locales set status = ${status} where listing_id = ${LISTING.ramen} and locale = 'ja'`;
        const blocked = await gate(tx);
        expect(blockerCodes(blocked)).toContain("locale_status_insufficient");

        await tx`update listing_locales set status = 'qa_approved' where listing_id = ${LISTING.ramen} and locale = 'ja'`;
        expect(blockerCodes(await gate(tx))).not.toContain("locale_status_insufficient");
      });
    },
  );
});

describe("blockers: provenance_missing / provenance_expired", () => {
  it("fires when a required field's current provenance is missing, clears on upsert", async () => {
    await withRollback(async (tx) => {
      await tx`update provenance set is_current = false
               where target_table = 'locations' and target_id = ${LOC.ramen} and field = 'hours' and is_current`;
      const blocked = await gate(tx);
      expect(
        blocked.some(
          (b) => b.blocker_code === "provenance_missing" && b.detail.field === "hours",
        ),
      ).toBe(true);

      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'hours', 'vendor', 'hours_confirmation')`;
      expect(blockerCodes(await gate(tx))).not.toContain("provenance_missing");
    });
  });

  it("fires when required provenance is expired, clears on re-verification", async () => {
    await withRollback(async (tx) => {
      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'hours', 'vendor', 'hours_confirmation', null, null, 'approved', (now() - interval '1 day'))`;
      const blocked = await gate(tx);
      expect(
        blocked.some(
          (b) => b.blocker_code === "provenance_expired" && b.detail.field === "hours",
        ),
      ).toBe(true);

      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'hours', 'vendor', 'hours_confirmation', null, null, 'approved', (now() + interval '90 days'))`;
      expect(blockerCodes(await gate(tx))).not.toContain("provenance_expired");
    });
  });

  it("non-approved provenance does not satisfy the gate", async () => {
    await withRollback(async (tx) => {
      await tx`select upsert_provenance('locations', ${LOC.ramen}::uuid, 'hours', 'vendor', 'hours_confirmation', null, null, 'pending', null)`;
      expect(blockerCodes(await gate(tx))).toContain("provenance_missing");
    });
  });
});

describe("blockers: photo_rights_missing / photo_not_moderated", () => {
  it("fires when an attached photo lacks rights metadata, clears when recorded", async () => {
    await withRollback(async (tx) => {
      await tx`update media set rights = null where id = ${MEDIA.ramenPhoto1}`;
      const blocked = await gate(tx);
      expect(
        blocked.some(
          (b) => b.blocker_code === "photo_rights_missing" && b.detail.media_id === MEDIA.ramenPhoto1,
        ),
      ).toBe(true);

      await tx`update media set rights = '{"license":"vendor_agreement_v1","granted_by":"Aloha Ramen Hale LLC"}'::jsonb where id = ${MEDIA.ramenPhoto1}`;
      expect(blockerCodes(await gate(tx))).not.toContain("photo_rights_missing");
    });
  });

  it("fires for incomplete rights (license without grantor)", async () => {
    await withRollback(async (tx) => {
      await tx`update media set rights = '{"license":"vendor_agreement_v1"}'::jsonb where id = ${MEDIA.ramenPhoto1}`;
      expect(blockerCodes(await gate(tx))).toContain("photo_rights_missing");
    });
  });

  it("fires when an attached photo is not approved, clears on approval", async () => {
    await withRollback(async (tx) => {
      await tx`update media set moderation_status = 'pending' where id = ${MEDIA.ramenPhoto2}`;
      const blocked = await gate(tx);
      expect(
        blocked.some(
          (b) => b.blocker_code === "photo_not_moderated" && b.detail.media_id === MEDIA.ramenPhoto2,
        ),
      ).toBe(true);

      await tx`update media set moderation_status = 'approved' where id = ${MEDIA.ramenPhoto2}`;
      expect(blockerCodes(await gate(tx))).not.toContain("photo_not_moderated");
    });
  });
});

describe("blockers: menu_evidence_missing / menu_rights_unlinked (trigger-bypass defense in depth)", () => {
  it("catches a published menu locale whose evidence was stripped under replica mode", async () => {
    await withRollback(async (tx) => {
      await tx`set local session_replication_role = 'replica'`;
      await tx`update menu_version_locales set approval_evidence_media_id = null where id = ${MENU.mvlJa}`;
      await tx`set local session_replication_role = 'origin'`;

      const blocked = await gate(tx);
      expect(blockerCodes(blocked)).toContain("menu_evidence_missing");

      await tx`set local session_replication_role = 'replica'`;
      await tx`update menu_version_locales set approval_evidence_media_id = ${MEDIA.ramenEvidenceJa} where id = ${MENU.mvlJa}`;
      await tx`set local session_replication_role = 'origin'`;
      expect(blockerCodes(await gate(tx))).not.toContain("menu_evidence_missing");
    });
  });

  it("catches evidence media of the wrong kind", async () => {
    await withRollback(async (tx) => {
      await tx`set local session_replication_role = 'replica'`;
      await tx`update menu_version_locales set approval_evidence_media_id = ${MEDIA.ramenPhoto1} where id = ${MENU.mvlJa}`;
      await tx`set local session_replication_role = 'origin'`;
      expect(blockerCodes(await gate(tx))).toContain("menu_evidence_missing");
    });
  });

  it("catches a menu whose source media lost its rights record", async () => {
    await withRollback(async (tx) => {
      await tx`set local session_replication_role = 'replica'`;
      await tx`update media set rights = null where id = ${MEDIA.ramenMenuSource}`;
      await tx`set local session_replication_role = 'origin'`;

      const blocked = await gate(tx);
      expect(blockerCodes(blocked)).toContain("menu_rights_unlinked");

      await tx`set local session_replication_role = 'replica'`;
      await tx`update media set rights = '{"license":"vendor_supplied","granted_by":"Aloha Ramen Hale LLC"}'::jsonb where id = ${MEDIA.ramenMenuSource}`;
      await tx`set local session_replication_role = 'origin'`;
      expect(blockerCodes(await gate(tx))).not.toContain("menu_rights_unlinked");
    });
  });

  it("a menu locale still in workflow (ko translation_pending) does not block the page", async () => {
    const blockers = await sql`select blocker_code from can_publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`;
    expect(blockers).toEqual([]);
  });
});

describe("blocker: category_integrity", () => {
  it("fires when the primary category is deactivated, clears on reactivation", async () => {
    await withRollback(async (tx) => {
      await tx`update categories set active = false where id = 'e0000000-0000-4000-8000-000000000011'`;
      const blocked = await gate(tx);
      expect(blockerCodes(blocked)).toContain("category_integrity");
      expect(blocked.find((b) => b.blocker_code === "category_integrity")?.detail.active).toBe(false);

      await tx`update categories set active = true where id = 'e0000000-0000-4000-8000-000000000011'`;
      expect(blockerCodes(await gate(tx))).not.toContain("category_integrity");
    });
  });

  it("fires when the primary category is publicly hidden (D4)", async () => {
    await withRollback(async (tx) => {
      await tx`update categories set publicly_visible = false where id = 'e0000000-0000-4000-8000-000000000011'`;
      expect(blockerCodes(await gate(tx))).toContain("category_integrity");
    });
  });

  it("fires when the category lacks a locale label+slug for the target locale", async () => {
    await withRollback(async (tx) => {
      await tx`delete from category_locales where category_id = 'e0000000-0000-4000-8000-000000000011' and locale = 'ja'`;
      const blocked = await gate(tx);
      expect(blockerCodes(blocked)).toContain("category_integrity");
      expect(blocked.find((b) => b.blocker_code === "category_integrity")?.detail.locale_complete).toBe(false);
    });
  });

  it("fires when the primary category is not attached via listing_categories", async () => {
    await withRollback(async (tx) => {
      // deferred constraint trigger never fires (tx rolls back pre-commit),
      // which is exactly the corrupt state the gate must catch
      await tx`delete from listing_categories where listing_id = ${LISTING.ramen} and category_id = 'e0000000-0000-4000-8000-000000000011'`;
      const blocked = await gate(tx);
      expect(blocked.find((b) => b.blocker_code === "category_integrity")?.detail.attached).toBe(false);
    });
  });

  it("fires for a cross-market primary category (FK bypassed)", async () => {
    await withRollback(async (tx) => {
      await tx`insert into markets (id, name) values ('maui-lahaina', 'Lahaina, Maui')`;
      await tx`set local session_replication_role = 'replica'`;
      await tx`update categories set market_id = 'maui-lahaina' where id = 'e0000000-0000-4000-8000-000000000011'`;
      await tx`set local session_replication_role = 'origin'`;
      const blocked = await gate(tx);
      expect(blocked.find((b) => b.blocker_code === "category_integrity")?.detail.market_match).toBe(false);
    });
  });
});

describe("blocker: market_mismatch", () => {
  it("fires when the location's market diverges (FK bypassed), clears on repair", async () => {
    await withRollback(async (tx) => {
      await tx`insert into markets (id, name) values ('maui-lahaina', 'Lahaina, Maui')`;
      await tx`set local session_replication_role = 'replica'`;
      await tx`update locations set market_id = 'maui-lahaina' where id = ${LOC.ramen}`;
      await tx`set local session_replication_role = 'origin'`;

      const blocked = await gate(tx);
      expect(
        blocked.some((b) => b.blocker_code === "market_mismatch" && b.detail.entity === "location"),
      ).toBe(true);

      await tx`set local session_replication_role = 'replica'`;
      await tx`update locations set market_id = 'oahu-waikiki' where id = ${LOC.ramen}`;
      await tx`set local session_replication_role = 'origin'`;
      expect(blockerCodes(await gate(tx))).not.toContain("market_mismatch");
    });
  });

  it("fires when the owning organization's market diverges", async () => {
    await withRollback(async (tx) => {
      await tx`insert into markets (id, name) values ('maui-lahaina', 'Lahaina, Maui')`;
      await tx`set local session_replication_role = 'replica'`;
      await tx`update organizations set market_id = 'maui-lahaina' where id = 'a0000000-0000-4000-8000-000000000001'`;
      await tx`set local session_replication_role = 'origin'`;
      const blocked = await gate(tx);
      expect(
        blocked.some((b) => b.blocker_code === "market_mismatch" && b.detail.entity === "organization"),
      ).toBe(true);
    });
  });

  it("fires when attached media carries a different market", async () => {
    await withRollback(async (tx) => {
      await tx`insert into markets (id, name) values ('maui-lahaina', 'Lahaina, Maui')`;
      await tx`set local session_replication_role = 'replica'`;
      await tx`update media set market_id = 'maui-lahaina' where id = ${MEDIA.ramenPhoto1}`;
      await tx`set local session_replication_role = 'origin'`;
      const blocked = await gate(tx);
      expect(
        blocked.some((b) => b.blocker_code === "market_mismatch" && b.detail.entity === "media"),
      ).toBe(true);
    });
  });

  it("composite FKs make cross-market attachment impossible through normal writes", async () => {
    await withRollback(async (tx) => {
      await tx`insert into markets (id, name) values ('maui-lahaina', 'Lahaina, Maui')`;
      await expect(
        tx`update locations set market_id = 'maui-lahaina' where id = ${LOC.ramen}`,
      ).rejects.toThrow(/violates foreign key constraint/);
    });
  });
});
