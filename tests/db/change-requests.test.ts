import { describe, expect, it } from "vitest";
import { expectErrorIn, setClaims, withRollback } from "./helpers";

const LISTING_ID = "c0000000-0000-4000-8000-000000000001";
const EDITOR_ID = "99000000-0000-4000-8000-000000000003";

async function seedRequest(tx: Parameters<Parameters<typeof withRollback>[0]>[0]) {
  const [listing] = await tx<{ version: number }[]>`select version from public.listings where id = ${LISTING_ID}`;
  const [request] = await tx<{ id: string }[]>`
    insert into public.change_requests
      (target_id, base_version, diff, sla_due_at)
    values
      (${LISTING_ID}, ${listing!.version}, ${tx.json({ field: "hours", details: "Weekday closing time is now 8 p.m." })}, now() + interval '48 hours')
    returning id
  `;
  return request!.id;
}

async function become(tx: Parameters<Parameters<typeof withRollback>[0]>[0], claims: Record<string, unknown>, role = "authenticated") {
  await setClaims(tx, { role: role as "authenticated" | "anon", ...claims }, true);
}

describe("change request queue", () => {
  it("denies anonymous reads and lets MFA staff read without direct mutation", async () => {
    await withRollback(async (tx) => {
      const id = await seedRequest(tx);
      await become(tx, { role: "anon" }, "anon");
      await expectErrorIn(tx, /permission denied/, (sp) => sp`select id from public.change_requests where id = ${id}`);

      await tx.unsafe("reset role");
      await become(tx, { sub: EDITOR_ID, aal: "aal2", app_roles: ["editor"] });
      expect((await tx`select id from public.change_requests where id = ${id}`).length).toBe(1);
      await expectErrorIn(tx, /permission denied/, (sp) => sp`update public.change_requests set assignee = ${EDITOR_ID} where id = ${id}`);
    });
  });

  it("requires editorial role + MFA and attributes assignment/resolution", async () => {
    await withRollback(async (tx) => {
      const id = await seedRequest(tx);
      await become(tx, { sub: EDITOR_ID, aal: "aal1", app_roles: ["editor"] });
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`select public.assign_change_request(${id}::uuid)`);

      await setClaims(tx, { sub: EDITOR_ID, aal: "aal2", app_roles: ["editor"] }, true);
      await tx`select public.assign_change_request(${id}::uuid)`;
      await tx`select public.resolve_change_request(${id}::uuid, 'rejected', 'Reliable source did not confirm the report.')`;
      const [row] = await tx<{ status: string; assignee: string; resolved_by: string }[]>`select status, assignee, resolved_by from public.change_requests where id = ${id}`;
      expect(row).toMatchObject({ status: "rejected", assignee: EDITOR_ID, resolved_by: EDITOR_ID });
    });
  });

  it("prevents a stale proposal from being marked merged", async () => {
    await withRollback(async (tx) => {
      const id = await seedRequest(tx);
      await tx`update public.listings set attributes = attributes || ${tx.json({ correction_test: true })} where id = ${LISTING_ID}`;
      await become(tx, { sub: EDITOR_ID, aal: "aal2", app_roles: ["editor"] });
      await expectErrorIn(tx, /version_conflict/, (sp) => sp`select public.resolve_change_request(${id}::uuid, 'merged', 'Applied after verification.')`);
    });
  });
});
