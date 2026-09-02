import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACTOR, LISTING, MEDIA } from "./fixtures";
import { expectErrorIn, setClaims, withClaims, withClaimsSuper } from "./helpers";

describe("Phase 0 deal workflow", () => {
  it("publishes reviewed EN/JA copy with evidence and deduplicates reveals", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      const [created] = await tx<{ id: string }[]>`
        select create_deal(${LISTING.ramen}::uuid, 'ALOHA20', now() - interval '1 minute', now() + interval '1 day') as id`;
      const id = created!.id;
      await tx`select save_deal_locale(${id}::uuid, 'en', 'Twenty percent off', 'Valid for dine-in orders before expiration.')`;
      await tx`select save_deal_locale(${id}::uuid, 'ja', '20％オフ', '有効期限までの店内飲食にご利用いただけます。')`;
      const locales = await tx<{ id: string; locale: string }[]>`select id,locale from deal_locales where deal_id=${id}`;
      for (const locale of locales) await tx`select review_deal_locale(${locale.id}::uuid, true)`;
      await tx`select activate_deal(${id}::uuid, ${MEDIA.ramenEvidenceEn}::uuid)`;

      expect((await tx`select status from deals where id=${id}`)[0]!.status).toBe("active");
      expect((await tx`select status from deal_locales where deal_id=${id} order by locale`).map((r)=>r.status)).toEqual(["published", "published"]);

      const session = randomUUID();
      const [first] = await tx<{ result: string; reveal_code: string; counted: boolean }[]>`select * from reveal_active_deal(${id}::uuid,'en',${session}::uuid)`;
      const [repeat] = await tx<{ counted: boolean }[]>`select * from reveal_active_deal(${id}::uuid,'en',${session}::uuid)`;
      expect(first).toMatchObject({ result: "ok", reveal_code: "ALOHA20", counted: true });
      expect(repeat!.counted).toBe(false);
      expect(Number((await tx`select count(*) from events where name='deal_reveal' and props->>'deal_id'=${id}`)[0]!.count)).toBe(1);
      expect(Number((await tx`select reveal_count from deals where id=${id}`)[0]!.reveal_count)).toBe(1);
    });
  });

  it("blocks activation until every required locale is reviewed", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      const [created] = await tx<{ id: string }[]>`select create_deal(${LISTING.ramen}::uuid,'WAIT',now(),now()+interval '1 day') as id`;
      await tx`select save_deal_locale(${created!.id}::uuid,'en','English offer','Terms are confirmed.')`;
      await expectErrorIn(tx, /deal_locales_not_approved/, (sp)=>sp`select activate_deal(${created!.id}::uuid,${MEDIA.ramenEvidenceEn}::uuid)`);
    });
  });

  it("allows the Japanese reviewer only on Japanese deal copy", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      const [created] = await tx<{ id: string }[]>`select create_deal(${LISTING.ramen}::uuid,'JA',now(),now()+interval '1 day') as id`;
      await tx`select save_deal_locale(${created!.id}::uuid,'en','English offer','English terms.')`;
      await tx`select save_deal_locale(${created!.id}::uuid,'ja','日本語の特典','日本語の利用条件です。')`;
      const rows=await tx<{id:string;locale:string}[]>`select id,locale from deal_locales where deal_id=${created!.id}`;
      await setClaims(tx, { sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" });
      await tx`select review_deal_locale(${rows.find((r)=>r.locale==='ja')!.id}::uuid,true)`;
      await expectErrorIn(tx,/permission_denied/,(sp)=>sp`select review_deal_locale(${rows.find((r)=>r.locale==='en')!.id}::uuid,true)`);
    });
  });

  it("keeps deal tables unreadable to anonymous clients", async () => {
    await withClaims({ role: "anon" }, async (tx) => {
      await expectErrorIn(tx, /permission denied/, (sp)=>sp`select * from deals`);
      await expectErrorIn(tx, /permission denied/, (sp)=>sp`select * from deal_reveals`);
    });
  });
});
