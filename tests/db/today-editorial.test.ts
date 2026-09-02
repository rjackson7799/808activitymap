import { describe, expect, it } from "vitest";
import { ACTOR, LISTING } from "./fixtures";
import { expectErrorIn, setClaims, withClaims, withClaimsSuper } from "./helpers";

describe("Phase 0 weekly editorial workflow", () => {
  it("publishes approved EN/JA copy and atomically archives the prior edition", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      const [created] = await tx<{id:string}[]>`select create_today_edition('2026-08-24') as id`;
      const id = created!.id;
      await tx`select save_today_edition_locale(${id}::uuid,'en','A quieter Waikiki morning','Two timely stops before the midday rush.','Start with a calm counter breakfast, then take the short walk to a second independently selected place before the neighborhood gets busy.')`;
      await tx`select save_today_edition_locale(${id}::uuid,'ja','静かなワイキキの朝','昼の混雑前に立ち寄りたい二つの場所です。','落ち着いたカウンターで朝を始めたら、街がにぎわう前に、編集チームが選んだもう一つの店まで短い散歩を楽しんでください。')`;
      await tx`select set_today_edition_items(${id}::uuid,array[${LISTING.ramen}::uuid,${LISTING.sushi}::uuid])`;
      const locales=await tx<{id:string}[]>`select id from today_edition_locales where edition_id=${id}`;
      for (const locale of locales) await tx`select review_today_edition_locale(${locale.id}::uuid,true)`;
      await tx`select publish_today_edition(${id}::uuid)`;
      expect((await tx`select status from today_editions where id=${id}`)[0]!.status).toBe("published");
      expect((await tx`select status from today_editions where id='85000000-0000-4000-8000-000000000001'`)[0]!.status).toBe("archived");
      expect((await tx`select status from today_edition_locales where edition_id=${id} order by locale`).map((row)=>row.status)).toEqual(["published","published"]);
      expect(Number((await tx`select count(*) from audit_log where target_table in ('today_editions','today_edition_locales','today_edition_items')`)[0]!.count)).toBeGreaterThan(0);
    });
  });

  it("enforces MFA, publisher release authority, and locale-matched review", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal1" }, async (tx) => {
      await expectErrorIn(tx,/aal2_required/,(sp)=>sp`select create_today_edition('2026-08-24')`);
    });
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      const [created]=await tx<{id:string}[]>`select create_today_edition('2026-08-24') as id`;
      await expectErrorIn(tx,/permission_denied/,(sp)=>sp`select publish_today_edition(${created!.id}::uuid)`);
    });
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" }, async (tx) => {
      const [created]=await tx<{id:string}[]>`select create_today_edition('2026-08-24') as id`;
      await tx`select save_today_edition_locale(${created!.id}::uuid,'en','English weekly title','English weekly introduction.','This is sufficiently long English editorial copy for the review workflow.')`;
      const [locale]=await tx<{id:string}[]>`select id from today_edition_locales where edition_id=${created!.id}`;
      await setClaims(tx,{sub:ACTOR.reviewerJa,app_roles:["language_reviewer_ja"],aal:"aal1"});
      await expectErrorIn(tx,/permission_denied/,(sp)=>sp`select review_today_edition_locale(${locale!.id}::uuid,true)`);
    });
  });

  it("keeps editorial tables and management functions unavailable to anonymous clients", async () => {
    await withClaims({role:"anon"},async(tx)=>{
      await expectErrorIn(tx,/permission denied/,(sp)=>sp`select * from today_editions`);
      await expectErrorIn(tx,/permission denied/,(sp)=>sp`select * from today_edition_locales`);
      await expectErrorIn(tx,/permission denied/,(sp)=>sp`select * from today_edition_items`);
      await expectErrorIn(tx,/permission denied/,(sp)=>sp`select * from list_admin_today_editions()`);
    });
  });
});
