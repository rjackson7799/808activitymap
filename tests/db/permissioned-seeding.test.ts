import { describe, expect, it } from "vitest";
import { expectErrorIn, withClaims, withClaimsSuper } from "./helpers";
import { ACTOR, CATEGORY } from "./fixtures";

const ids = {
  organization: "71000000-0000-4000-8000-000000000001",
  location: "71000000-0000-4000-8000-000000000002",
  hours: "71000000-0000-4000-8000-000000000003",
  listing: "71000000-0000-4000-8000-000000000004",
};
const photo = "71000000-0000-4000-8000-000000000005";
const evidence = "71000000-0000-4000-8000-000000000006";
const menuIds = {
  source: "71000000-0000-4000-8000-000000000011", evidence: "71000000-0000-4000-8000-000000000012",
  document: "71000000-0000-4000-8000-000000000013", version: "71000000-0000-4000-8000-000000000014",
  locale: "71000000-0000-4000-8000-000000000015", section: "71000000-0000-4000-8000-000000000016",
  item: "71000000-0000-4000-8000-000000000017",
};
const ja = { name: "パーミッションテスト", slug: "パーミッションテスト", editorial_note: "現地で確認済みです。", seo_title: "パーミッションテスト", seo_desc: "許可済みのテスト掲載です。" };
const ko = { name: "퍼미션 테스트", slug: "퍼미션-테스트", editorial_note: "현장에서 확인되었습니다.", seo_title: "퍼미션 테스트", seo_desc: "사용 허가를 받은 테스트 목록입니다." };

function payload(confirmed: boolean) {
  return {
    ids, external_ref: "permissioned-test", organization: { name: "Permissioned Test" },
    location: { address: { street: "1 Test St", city: "Honolulu", region: "HI", postal_code: "96815", country: "US" }, geo_lat: 21.28, geo_lng: -157.83, phone: "+1-808-555-0199" },
    hours: { mon: { spans: [{ open: "09:00", close: "17:00" }] }, tue: { closed: true }, wed: { closed: true }, thu: { closed: true }, fri: { closed: true }, sat: { closed: true }, sun: { closed: true } },
    category: { primary_id: CATEGORY.cafe, secondary_ids: [] },
    locale: { name: "Permissioned Test", slug: "permissioned-test", editorial_note: "Verified locally.", seo_title: "Permissioned Test", seo_desc: "A permissioned fixture." },
    source: { website: "https://example.invalid" },
    verification: confirmed ? { confirmed: true, granted_by: "Fixture Vendor", verified_at: "2026-08-29T20:00:00Z", evidence_media_id: evidence, evidence_path: "permission/test.pdf" } : { confirmed: false },
    photos: confirmed ? [{ id: photo, path: "seed/permission/test.jpg", license: "agreement", granted_by: "Fixture Vendor", alt: "Fixture exterior", position: 0 }] : [],
  };
}

describe("permissioned dossier loader", () => {
  it("requires publisher/super-admin AAL2", async () => {
    await withClaims({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal1" }, async (tx) => {
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`select load_permissioned_dossier(${tx.json(payload(false))}::jsonb)`);
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`
        select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ja', ${tx.json(ja)}::jsonb)
      `);
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`
        select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ko', ${tx.json(ko)}::jsonb)
      `);
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`select load_permissioned_menu_dossier(${tx.json({})}::jsonb)`);
    });
  });

  it("loads an unconfirmed draft with pending provenance and publication blockers", async () => {
    await withClaims({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      const loaded = await tx`select load_permissioned_dossier(${tx.json(payload(false))}::jsonb) as id`;
      expect(loaded[0]!.id).toBe(ids.listing);
      const locale = await tx`select status from listing_locales where listing_id=${ids.listing}`;
      expect(locale[0]!.status).toBe("qa_pending");
      const provenance = await tx`select approval_status from provenance where target_id=${ids.listing} and field='name' and is_current`;
      expect(provenance[0]!.approval_status).toBe("pending");
      const blockers = await tx`select blocker_code from can_publish_listing_locale(${ids.listing}, 'en')`;
      expect(blockers.map((row) => row.blocker_code)).toEqual(expect.arrayContaining(["missing_required_field", "locale_status_insufficient", "provenance_missing"]));
      await expectErrorIn(tx, /permissioned_source_not_confirmed/, (sp) => sp`
        select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ja', ${tx.json(ja)}::jsonb)
      `);
      await expectErrorIn(tx, /permissioned_source_not_confirmed/, (sp) => sp`
        select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ko', ${tx.json(ko)}::jsonb)
      `);
    });
  });

  it("links private permission evidence when verification is confirmed", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      await tx`insert into storage.objects (bucket_id, name) values ('evidence', 'permission/test.pdf'), ('public-photos', 'seed/permission/test.jpg')`;
      await tx`select load_permissioned_dossier(${tx.json(payload(true))}::jsonb)`;
      const rows = await tx`select approval_status, evidence_media_id from provenance where target_id=${ids.listing} and field='name' and is_current`;
      expect(rows).toEqual([{ approval_status: "approved", evidence_media_id: evidence }]);
      const badgeEvidence = await tx`
        select target_table, field, approval_status, evidence_media_id
        from provenance
        where is_current and (
          (target_id=${ids.listing} and field in ('name', 'primary_category'))
          or (target_id=${ids.location} and field in ('address', 'geo', 'phone', 'hours'))
          or (target_id=${photo} and field='rights')
        )
        order by target_table, field
      `;
      expect(badgeEvidence).toHaveLength(7);
      expect(badgeEvidence.every((fact) => fact.approval_status === "approved" && fact.evidence_media_id === evidence)).toBe(true);
      const media = await tx`select moderation_status, rights->>'license' as license from media where id=${photo}`;
      expect(media).toEqual([{ moderation_status: "approved", license: "agreement" }]);

      await tx`select transition_listing_locale(${ids.listing}::uuid, 'en', 'qa_approved')`;
      expect(await tx`select * from can_publish_listing_locale(${ids.listing}::uuid, 'en')`).toEqual([]);
      await tx`select publish_listing_locale(${ids.listing}::uuid, 'en')`;
      const published = await tx`select publication_status from listings where id=${ids.listing}`;
      const locale = await tx`select status from listing_locales where listing_id=${ids.listing} and locale='en'`;
      expect(published).toEqual([{ publication_status: "published" }]);
      expect(locale).toEqual([{ status: "published" }]);

      await tx`select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ja', ${tx.json(ja)}::jsonb)`;
      expect(await tx`select status from listing_locales where listing_id=${ids.listing} and locale='ja'`).toEqual([{ status: "machine_draft" }]);
      expect(await tx`select blocker_code from can_publish_listing_locale(${ids.listing}::uuid, 'ja')`).toEqual(
        expect.arrayContaining([{ blocker_code: "locale_status_insufficient" }]),
      );
      await tx`select transition_listing_locale(${ids.listing}::uuid, 'ja', 'qa_pending')`;
      await tx`select transition_listing_locale(${ids.listing}::uuid, 'ja', 'qa_approved')`;
      expect(await tx`select * from can_publish_listing_locale(${ids.listing}::uuid, 'ja')`).toEqual([]);
      await tx`select publish_listing_locale(${ids.listing}::uuid, 'ja')`;
      expect(await tx`select status from listing_locales where listing_id=${ids.listing} and locale='ja'`).toEqual([{ status: "published" }]);
      await tx`select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ja', ${tx.json(ja)}::jsonb)`;
      await expectErrorIn(tx, /locale_locked_for_review/, (sp) => sp`
        select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ja', ${tx.json({ ...ja, name: "変更不可" })}::jsonb)
      `);

      await tx`select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ko', ${tx.json(ko)}::jsonb)`;
      expect(await tx`select status from listing_locales where listing_id=${ids.listing} and locale='ko'`).toEqual([{ status: "machine_draft" }]);
      await tx`select transition_listing_locale(${ids.listing}::uuid, 'ko', 'qa_pending')`;
      await tx`select transition_listing_locale(${ids.listing}::uuid, 'ko', 'qa_approved')`;
      expect(await tx`select * from can_publish_listing_locale(${ids.listing}::uuid, 'ko')`).toEqual([]);
      await tx`select publish_listing_locale(${ids.listing}::uuid, 'ko')`;
      expect(await tx`select status from listing_locales where listing_id=${ids.listing} and locale='ko'`).toEqual([{ status: "published" }]);
      await tx`select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ko', ${tx.json(ko)}::jsonb)`;
      await expectErrorIn(tx, /locale_locked_for_review/, (sp) => sp`
        select stage_permissioned_listing_locale(${ids.listing}::uuid, 'ko', ${tx.json({ ...ko, name: "변경 불가" })}::jsonb)
      `);

      await tx`insert into storage.objects(bucket_id,name) values ('menu-sources','menu/test.pdf'),('evidence','approval/menu-test.pdf')`;
      const menu = {
        ids: { listing: ids.listing, document: menuIds.document, version: menuIds.version, locales: { en: menuIds.locale } },
        version: 1,
        seed_hash: "menu-hash-v1",
        source: { id: menuIds.source, path: "menu/test.pdf", license: "vendor-supplied", granted_by: "Fixture Vendor", captured_at: "2026-08-29T20:00:00Z" },
        approval: { id: menuIds.evidence, path: "approval/menu-test.pdf", license: "vendor-approval", granted_by: "Fixture Vendor" },
        sections: [{ id: menuIds.section, ref: "main", position: 0, items: [{ id: menuIds.item, ref: "bowl", position: 0, price_cents: 1200, currency: "USD", price_type: "fixed", flags: {}, owner_pick: true }] }],
        locales: { en: { sections: [{ ref: "main", name: "Main", items: [{ ref: "bowl", name: "Fixture Bowl", human_confirmed: true }] }] } },
      };
      await expectErrorIn(tx, /menu_id_collision/, (sp) => sp`
        select load_permissioned_menu_dossier(${tx.json({ ...menu, source: { ...menu.source, id: photo } })}::jsonb)
      `);
      expect((await tx`select load_permissioned_menu_dossier(${tx.json(menu)}::jsonb) as id`)[0]!.id).toBe(menuIds.version);
      expect(await tx`select status from menu_version_locales where id=${menuIds.locale}`).toEqual([{ status: "translation_pending" }]);
      await tx`select transition_menu_version_locale(${menuIds.locale}::uuid,'qa_pending')`;
      await tx`select transition_menu_version_locale(${menuIds.locale}::uuid,'qa_approved')`;
      await tx`select transition_menu_version_locale(${menuIds.locale}::uuid,'approved','vendor_approved_external',${menuIds.evidence}::uuid)`;
      expect(await tx`select * from can_publish_menu_locale(${menuIds.locale}::uuid)`).toEqual([]);
      await tx`select transition_menu_version_locale(${menuIds.locale}::uuid,'published')`;
      expect(await tx`select status from menu_versions where id=${menuIds.version}`).toEqual([{ status: "active" }]);
      await expectErrorIn(tx, /menu_locked_for_review/, (sp) => sp`select load_permissioned_menu_dossier(${tx.json({ ...menu, seed_hash: "changed" })}::jsonb)`);
    });
  });
});
