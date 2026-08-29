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
    });
  });

  it("links private permission evidence when verification is confirmed", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      await tx`insert into storage.objects (bucket_id, name) values ('evidence', 'permission/test.pdf'), ('public-photos', 'seed/permission/test.jpg')`;
      await tx`select load_permissioned_dossier(${tx.json(payload(true))}::jsonb)`;
      const rows = await tx`select approval_status, evidence_media_id from provenance where target_id=${ids.listing} and field='name' and is_current`;
      expect(rows).toEqual([{ approval_status: "approved", evidence_media_id: evidence }]);
      const media = await tx`select moderation_status, rights->>'license' as license from media where id=${photo}`;
      expect(media).toEqual([{ moderation_status: "approved", license: "agreement" }]);
    });
  });
});
