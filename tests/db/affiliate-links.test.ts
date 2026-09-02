import { describe, expect, it } from "vitest";
import { ACTOR, LISTING } from "./fixtures";
import { expectErrorIn, setClaims, withClaims, withClaimsSuper } from "./helpers";

describe("Phase 0 affiliate links", () => {
  it("lets MFA-backed editors curate a link and resolves it only for a published locale", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      const [created] = await tx<{ id: string }[]>`
        select create_affiliate_link(
          ${LISTING.ramen}::uuid, 'demo-partner', 'Demo Partner',
          'https://example.com/activity?ref=808', 'nearby_activity', 10
        ) as id`;
      const id = created!.id;
      const [resolved] = await tx<{ destination_url: string; partner_key: string; context: string; listing_id: string }[]>`
        select * from resolve_affiliate_clickout(${id}::uuid, 'en')`;
      expect(resolved).toMatchObject({
        destination_url: "https://example.com/activity?ref=808",
        partner_key: "demo-partner",
        context: "nearby_activity",
        listing_id: LISTING.ramen,
      });
      expect(await tx`select * from resolve_affiliate_clickout(${id}::uuid, 'ko')`).toEqual([]);
      await tx`select set_affiliate_link_status(${id}::uuid, 'hidden')`;
      expect(await tx`select * from resolve_affiliate_clickout(${id}::uuid, 'en')`).toEqual([]);
    });
  });

  it("requires a current privileged role and MFA for management", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal1" }, async (tx) => {
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`
        select create_affiliate_link(${LISTING.ramen}::uuid,'mfa-test','MFA Test','https://example.com','other',0)`);
      await setClaims(tx, { sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal2" });
      await expectErrorIn(tx, /permission_denied/, (sp) => sp`
        select create_affiliate_link(${LISTING.ramen}::uuid,'role-test','Role Test','https://example.com','other',0)`);
    });
  });

  it("rejects private destinations even when the guarded RPC is called directly", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      await expectErrorIn(tx, /invalid_affiliate_destination/, (sp) => sp`
        select create_affiliate_link(${LISTING.ramen}::uuid,'private-test','Private Test','https://127.0.0.1/admin','other',0)`);
    });
  });

  it("auto-hides a link after two failed weekly health results", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      const [created] = await tx<{ id: string }[]>`
        select create_affiliate_link(${LISTING.ramen}::uuid,'health-test','Health Test','https://example.com','other',0) as id`;
      await tx`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
      expect((await tx`select record_affiliate_link_health(${created!.id}::uuid,500,false) as status`)[0]!.status).toBe("active");
      expect((await tx`select record_affiliate_link_health(${created!.id}::uuid,500,false) as status`)[0]!.status).toBe("dead");
      expect((await tx`select status,consecutive_failures from affiliate_links where id=${created!.id}`)[0]).toMatchObject({ status: "dead", consecutive_failures: 2 });
    });
  });

  it("keeps destinations unreadable to anonymous and authenticated browsers", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await withClaims({ role }, async (tx) => {
        await expectErrorIn(tx, /permission denied/, (sp) => sp`select destination_url from affiliate_links`);
        await expectErrorIn(tx, /permission denied/, (sp) => sp`select * from resolve_affiliate_clickout(gen_random_uuid(),'en')`);
      });
    }
  });
});
