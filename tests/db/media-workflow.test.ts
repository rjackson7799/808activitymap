import { describe, expect, it } from "vitest";
import { ACTOR, LISTING, MEDIA } from "./fixtures";
import { expectErrorIn, setClaims, withClaims, withRollback, type TxSql } from "./helpers";

const NEW_MEDIA = "f9000000-0000-4000-8000-000000000001";
const PENDING_MEDIA = "f9000000-0000-4000-8000-000000000002";

async function seedReplacement(tx: TxSql, id: string, status = "approved") {
  await tx.unsafe("reset role");
  await tx`insert into storage.objects (bucket_id, name)
    values ('public-photos', ${`versioned/${id}.webp`})`;
  await tx`insert into media
    (id, bucket, path, kind, rights, moderation_status, market_id)
    values (
      ${id}, 'public-photos', ${`versioned/${id}.webp`}, 'photo',
      '{"license":"permissioned","granted_by":"fixture"}'::jsonb,
      ${status}, 'oahu-waikiki'
    )`;
}

describe("immutable, audited listing-photo replacement", () => {
  for (const role of ["super_admin", "publisher", "editor"] as const) {
    it(`${role}@aal2 atomically replaces the pointer and writes before/after audit`, async () => {
      await withRollback(async (tx) => {
        await seedReplacement(tx, NEW_MEDIA);
        await setClaims(
          tx,
          { sub: ACTOR.admin, app_roles: [role], aal: "aal2" },
          true,
        );

        await tx`select replace_listing_photo(${LISTING.ramen}, ${MEDIA.ramenPhoto1}, ${NEW_MEDIA})`;

        const attachment = await tx`select media_id, position, market_id from listing_media
          where listing_id = ${LISTING.ramen} and media_id = ${NEW_MEDIA}`;
        expect(attachment).toHaveLength(1);
        expect(attachment[0]).toMatchObject({ position: 0, market_id: "oahu-waikiki" });

        const audit = await tx`select actor, action, before, after from audit_log
          where target_table = 'listing_media'
            and before->>'media_id' = ${MEDIA.ramenPhoto1}
            and after->>'media_id' = ${NEW_MEDIA}`;
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ actor: ACTOR.admin, action: "UPDATE" });
      });
    });
  }

  it("denies aal1 privileged, mixed-role aal1, and ops-only callers", async () => {
    for (const claims of [
      { app_roles: ["editor"], aal: "aal1" },
      { app_roles: ["editor", "ops_agent"], aal: "aal1" },
      { app_roles: ["ops_agent"], aal: "aal2" },
    ] as const) {
      await withClaims(
        { sub: ACTOR.admin, app_roles: [...claims.app_roles], aal: claims.aal },
        async (tx) => {
          await expectErrorIn(tx, /aal2_required|permission_denied/, (sp) =>
            sp`select replace_listing_photo(${LISTING.ramen}, ${MEDIA.ramenPhoto1}, ${MEDIA.ramenPhoto2})`,
          );
        },
      );
    }
  });

  it("rejects stale and unapproved replacements without changing the pointer", async () => {
    await withRollback(async (tx) => {
      await seedReplacement(tx, PENDING_MEDIA, "pending");
      await setClaims(
        tx,
        { sub: ACTOR.admin, app_roles: ["publisher"], aal: "aal2" },
        true,
      );

      await expectErrorIn(tx, /not approved/, (sp) =>
        sp`select replace_listing_photo(${LISTING.ramen}, ${MEDIA.ramenPhoto1}, ${PENDING_MEDIA})`,
      );
      await expectErrorIn(tx, /stale_replacement/, (sp) =>
        sp`select replace_listing_photo(
          ${LISTING.ramen}, 'f9000000-0000-4000-8000-000000000099', ${MEDIA.ramenPhoto2}
        )`,
      );
      const original = await tx`select 1 from listing_media
        where listing_id = ${LISTING.ramen} and media_id = ${MEDIA.ramenPhoto1}`;
      expect(original).toHaveLength(1);
    });
  });

  it("rejects approved metadata without a backing Storage object", async () => {
    await withRollback(async (tx) => {
      await tx`insert into media
        (id, bucket, path, kind, rights, moderation_status, market_id)
        values (
          ${NEW_MEDIA}, 'public-photos', 'versioned/missing-object.webp', 'photo',
          '{"license":"permissioned","granted_by":"fixture"}'::jsonb,
          'approved', 'oahu-waikiki'
        )`;
      await setClaims(
        tx,
        { sub: ACTOR.admin, app_roles: ["publisher"], aal: "aal2" },
        true,
      );
      await expectErrorIn(tx, /Storage object is missing/, (sp) =>
        sp`select replace_listing_photo(${LISTING.ramen}, ${MEDIA.ramenPhoto1}, ${NEW_MEDIA})`,
      );
    });
  });

  it("denies direct pointer changes and media-path repointing", async () => {
    await withClaims(
      { sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" },
      async (tx) => {
        await expectErrorIn(tx, /permission denied/, (sp) => sp`update listing_media
          set media_id = ${MEDIA.ramenPhoto2}
          where listing_id = ${LISTING.ramen} and media_id = ${MEDIA.ramenPhoto1}`);
        await expectErrorIn(tx, /immutable_media_identity/, (sp) => sp`update media
          set path = 'versioned/repointed.webp' where id = ${MEDIA.ramenPhoto1}`);
      },
    );
  });

  it("forces ops uploads to pending and prevents direct attachment", async () => {
    await withClaims(
      { sub: ACTOR.admin, app_roles: ["ops_agent"], aal: "aal1" },
      async (tx) => {
        await expectErrorIn(tx, /must begin pending/, (sp) => sp`insert into media
          (bucket, path, kind, moderation_status)
          values ('public-photos', 'ops/self-approved.jpg', 'photo', 'approved')`);
        await tx`insert into media (id, bucket, path, kind)
          values (${NEW_MEDIA}, 'public-photos', 'ops/pending.jpg', 'photo')`;
        const pending = await tx`select moderation_status from media where id = ${NEW_MEDIA}`;
        expect(pending[0]!.moderation_status).toBe("pending");
        await expectErrorIn(tx, /row-level security/, (sp) => sp`insert into listing_media
          (listing_id, media_id) values (${LISTING.ramen}, ${NEW_MEDIA})`);
      },
    );
  });
});
