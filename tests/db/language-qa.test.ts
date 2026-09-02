import { describe, expect, it } from "vitest";
import { ACTOR, LISTING } from "./fixtures";
import { expectErrorIn, withClaimsSuper } from "./helpers";

describe("Phase 0 locale QA work contracts", () => {
  it("matching reviewer claims, times, and approves an own-locale item", async () => {
    await withClaimsSuper({ sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" }, async (tx) => {
      const [target] = await tx<{ id: string }[]>`select id from listing_locales where listing_id=${LISTING.coffee} and locale='ja'`;
      await tx`update listing_locales set status='qa_pending' where id=${target!.id}`;
      const [claimed] = await tx<{ id: string }[]>`select claim_qa_item('listing_locale',${target!.id}::uuid,'ja') as id`;
      await tx`select start_qa_work('listing_locale',${target!.id}::uuid,'ja')`;
      await tx`select pause_qa_work('listing_locale',${target!.id}::uuid,'ja')`;
      await tx`select start_qa_work('listing_locale',${target!.id}::uuid,'ja')`;
      await tx`select decide_qa_item('listing_locale',${target!.id}::uuid,'ja','approved')`;

      expect((await tx`select status from listing_locales where id=${target!.id}`)[0]!.status).toBe("qa_approved");
      expect((await tx`select completed_at is not null as complete,outcome from qa_assignments where id=${claimed!.id}`)[0]).toEqual({ complete: true, outcome: "approved" });
      const sessions = await tx`select ended_at is not null as ended,end_reason from qa_work_sessions where assignment_id=${claimed!.id} order by started_at`;
      expect(sessions).toHaveLength(2);
      expect(sessions.every((row) => row.ended)).toBe(true);
      expect(sessions.map((row) => row.end_reason)).toEqual(["paused", "completed"]);
    });
  });

  it("rejects a reviewer working the other locale", async () => {
    await withClaimsSuper({ sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" }, async (tx) => {
      const [target] = await tx<{ id: string }[]>`select id from listing_locales where listing_id=${LISTING.ramen} and locale='ko'`;
      await expectErrorIn(tx, /permission_denied/, (sp) => sp`select claim_qa_item('listing_locale',${target!.id}::uuid,'ko')`);
    });
  });

  it("requires MFA when publisher+ performs locale QA", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal1" }, async (tx) => {
      const [target] = await tx<{ id: string }[]>`select id from listing_locales where listing_id=${LISTING.coffee} and locale='ja'`;
      await tx`update listing_locales set status='qa_pending' where id=${target!.id}`;
      await expectErrorIn(tx, /aal2_required/, (sp) => sp`select claim_qa_item('listing_locale',${target!.id}::uuid,'ja')`);
    });
  });
});
