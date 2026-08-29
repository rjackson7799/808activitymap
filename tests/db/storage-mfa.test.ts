import { describe, expect, it } from "vitest";
import { expectErrorIn, setClaims, withRollback, type TxSql } from "./helpers";

const ACTOR = "89000000-0000-4000-8000-000000000001";
const DENIED = /row-level security policy|permission denied/;

async function assumeClaims(
  tx: TxSql,
  appRoles: string[],
  aal: "aal1" | "aal2",
): Promise<void> {
  await setClaims(tx, { sub: ACTOR, app_roles: appRoles, aal }, true);
}

async function seedObject(tx: TxSql, bucket: string, name: string): Promise<void> {
  await tx.unsafe("reset role");
  await tx`insert into storage.objects (bucket_id, name) values (${bucket}, ${name})`;
}

async function allowStorageApiDelete(tx: TxSql): Promise<void> {
  await tx.unsafe("reset role");
  // Supabase Storage sets this request-local guard before its DELETE SQL. The
  // database harness mirrors that API context so the RLS policy is exercised.
  await tx`select set_config('storage.allow_delete_query', 'true', true)`;
}

async function expectPrivilegedAal1Denied(tx: TxSql, roles: string[], prefix: string) {
  const updateName = `${prefix}/existing-update.jpg`;
  const deleteName = `${prefix}/existing-delete.jpg`;
  await seedObject(tx, "public-photos", updateName);
  await seedObject(tx, "public-photos", deleteName);
  await allowStorageApiDelete(tx);
  await assumeClaims(tx, roles, "aal1");

  for (const [bucket, suffix] of [
    ["public-photos", "photo.jpg"],
    ["menu-sources", "menu.pdf"],
    ["evidence", "evidence.pdf"],
  ] as const) {
    await expectErrorIn(tx, DENIED, (sp) =>
      sp`insert into storage.objects (bucket_id, name) values (${bucket}, ${`${prefix}/${suffix}`})`,
    );
  }

  const updated = await tx`update storage.objects set metadata = '{"probe":true}'::jsonb
    where bucket_id = 'public-photos' and name = ${updateName} returning name`;
  const deleted = await tx`delete from storage.objects
    where bucket_id = 'public-photos' and name = ${deleteName} returning name`;
  expect(updated).toEqual([]);
  expect(deleted).toEqual([]);
}

describe("direct Storage write MFA boundary", () => {
  for (const role of ["super_admin", "publisher", "editor"] as const) {
    it(`${role} requires aal2 for every permitted Storage mutation`, async () => {
      await withRollback(async (tx) => {
        await expectPrivilegedAal1Denied(tx, [role], `mfa/${role}/aal1`);
        await assumeClaims(tx, [role], "aal2");

        const photo = `mfa/${role}/aal2/photo.jpg`;
        const menu = `mfa/${role}/aal2/menu.pdf`;
        const evidence = `mfa/${role}/aal2/evidence.pdf`;
        expect(await tx`insert into storage.objects (bucket_id, name)
          values ('public-photos', ${photo}) returning name`).toHaveLength(1);
        // Private buckets intentionally have no SELECT policy, so INSERT
        // cannot use RETURNING even when the write itself is authorized.
        await tx`insert into storage.objects (bucket_id, name)
          values ('menu-sources', ${menu})`;
        await tx`insert into storage.objects (bucket_id, name)
          values ('evidence', ${evidence})`;
        expect(await tx`update storage.objects set metadata = '{"approved":true}'::jsonb
          where bucket_id = 'public-photos' and name = ${photo} returning name`).toEqual([]);
        await allowStorageApiDelete(tx);
        await assumeClaims(tx, [role], "aal2");
        expect(await tx`delete from storage.objects
          where bucket_id = 'public-photos' and name = ${photo} returning name`).toEqual([]);
      });
    });
  }

  it("preserves ops-only aal1 behavior without granting evidence writes", async () => {
    await withRollback(async (tx) => {
      await assumeClaims(tx, ["ops_agent"], "aal1");
      const photo = "mfa/ops/photo.jpg";
      expect(await tx`insert into storage.objects (bucket_id, name)
        values ('public-photos', ${photo}) returning name`).toHaveLength(1);
      await tx`insert into storage.objects (bucket_id, name)
        values ('menu-sources', 'mfa/ops/menu.pdf')`;
      await expectErrorIn(tx, DENIED, (sp) => sp`insert into storage.objects (bucket_id, name)
        values ('evidence', 'mfa/ops/evidence.pdf')`);
      expect(await tx`update storage.objects set metadata = '{"ops":true}'::jsonb
        where bucket_id = 'public-photos' and name = ${photo} returning name`).toEqual([]);
      await allowStorageApiDelete(tx);
      await assumeClaims(tx, ["ops_agent"], "aal1");
      expect(await tx`delete from storage.objects
        where bucket_id = 'public-photos' and name = ${photo} returning name`).toEqual([]);
    });
  });

  it("does not let a mixed privileged+ops aal1 JWT use the ops branch", async () => {
    await withRollback((tx) =>
      expectPrivilegedAal1Denied(tx, ["editor", "ops_agent"], "mfa/mixed/aal1"),
    );
  });

  it("prevents an authorized update from moving an object across buckets", async () => {
    await withRollback(async (tx) => {
      const name = "mfa/editor/cross-bucket.jpg";
      await seedObject(tx, "public-photos", name);
      await assumeClaims(tx, ["editor"], "aal2");
      expect(await tx`update storage.objects set bucket_id = 'evidence'
        where bucket_id = 'public-photos' and name = ${name} returning name`).toEqual([]);
    });
  });

  it("requires a fresh object key instead of overwriting an existing key", async () => {
    await withRollback(async (tx) => {
      await assumeClaims(tx, ["publisher"], "aal2");
      await tx`insert into storage.objects (bucket_id, name)
        values ('public-photos', 'immutable/version-1.jpg')`;
      await expectErrorIn(tx, /duplicate key value|unique constraint/, (sp) =>
        sp`insert into storage.objects (bucket_id, name)
          values ('public-photos', 'immutable/version-1.jpg')`,
      );
    });
  });
});
