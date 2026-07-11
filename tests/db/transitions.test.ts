import { describe, expect, it } from "vitest";
import { expectErrorIn, withClaimsSuper, withRollback } from "./helpers";
import { ACTOR, LISTING, MEDIA, MENU } from "./fixtures";

/**
 * Guarded transition functions (migration 15): role + aal2 + contract
 * blockers + valid state-machine edge, with an intent audit row — atomically.
 * Claims are simulated via the request.jwt.claims GUC (ADR-003 harness);
 * the SECURITY DEFINER functions read roles/aal exactly as they would behind
 * PostgREST.
 */

const publisherAal2 = { sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" as const };

describe("publish_listing_locale — authorization", () => {
  it("rejects a caller with no claims at all", async () => {
    await withRollback(async (tx) => {
      await expect(
        tx`select publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`,
      ).rejects.toThrow(/permission_denied/);
    });
  });

  it("rejects an editor even with aal2 (only publisher/super_admin publish)", async () => {
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      await expect(
        tx`select publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`,
      ).rejects.toThrow(/permission_denied/);
    });
  });

  it("rejects a language reviewer", async () => {
    await withClaimsSuper({ sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal2" }, async (tx) => {
      await expect(
        tx`select publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`,
      ).rejects.toThrow(/permission_denied/);
    });
  });

  it("rejects a publisher without aal2 — MFA follows the actor to the DB", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal1" }, async (tx) => {
      await expect(
        tx`select publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`,
      ).rejects.toThrow(/aal2_required/);
    });
  });
});

describe("publish_listing_locale — contract + state machine", () => {
  it("refuses to publish a blocked listing, naming the blockers", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      await expect(
        tx`select publish_listing_locale(${LISTING.coffee}::uuid, 'ja')`,
      ).rejects.toThrow(/publication_blocked.*locale_status_insufficient/s);
    });
  });

  it("refuses an already-published locale (invalid transition)", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      await expect(
        tx`select publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`,
      ).rejects.toThrow(/invalid_transition/);
    });
  });

  it("publishes a qa_approved locale, flips the listing, writes the intent audit row", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      // stage: A/ja back to qa_approved, listing to unpublished
      await tx`update listing_locales set status = 'qa_approved' where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      await tx`update listing_locales set status = 'withdrawn' where listing_id = ${LISTING.ramen} and locale = 'en'`;
      await tx`update listings set publication_status = 'unpublished' where id = ${LISTING.ramen}`;

      await tx`select publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`;

      const ll = await tx`select status from listing_locales where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      const l = await tx`select publication_status from listings where id = ${LISTING.ramen}`;
      expect(ll[0]!.status).toBe("published");
      expect(l[0]!.publication_status).toBe("published");

      const audit = await tx`
        select actor, actor_source from audit_log
        where action = 'publish_listing_locale'
          and (after->>'listing_id') = ${LISTING.ramen}
        order by at desc limit 1`;
      expect(audit).toHaveLength(1);
      expect(audit[0]!.actor).toBe(ACTOR.publisher);
      expect(audit[0]!.actor_source).toBe("jwt");
    });
  });

  it("refuses to publish any locale of an archived listing", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      await tx`update listing_locales set status = 'qa_approved' where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      await tx`update listings set publication_status = 'archived' where id = ${LISTING.ramen}`;
      await expect(
        tx`select publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`,
      ).rejects.toThrow(/archived/);
    });
  });
});

describe("unpublish_listing_locale", () => {
  it("withdraws one locale; listing stays published while another locale serves", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      await tx`select unpublish_listing_locale(${LISTING.ramen}::uuid, 'ja', 'test takedown')`;
      const ll = await tx`select status from listing_locales where listing_id = ${LISTING.ramen} and locale = 'ja'`;
      const l = await tx`select publication_status from listings where id = ${LISTING.ramen}`;
      expect(ll[0]!.status).toBe("withdrawn");
      expect(l[0]!.publication_status).toBe("published"); // EN still serving

      const view = await tx`select locale from publishable_locale_pages where listing_id = ${LISTING.ramen}`;
      expect(view.map((r) => r.locale)).toEqual(["en"]);
    });
  });

  it("unpublishing the last serving locale flips the listing to unpublished", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      await tx`select unpublish_listing_locale(${LISTING.ramen}::uuid, 'ja', null)`;
      await tx`select unpublish_listing_locale(${LISTING.ramen}::uuid, 'en', null)`;
      const l = await tx`select publication_status from listings where id = ${LISTING.ramen}`;
      expect(l[0]!.publication_status).toBe("unpublished");
      const view = await tx`select 1 from publishable_locale_pages where listing_id = ${LISTING.ramen}`;
      expect(view).toEqual([]);
    });
  });

  it("rejects unpublishing a locale that is not serving", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      await expect(
        tx`select unpublish_listing_locale(${LISTING.ramen}::uuid, 'ko', null)`,
      ).rejects.toThrow(/invalid_transition/);
    });
  });

  it("requires publisher role and aal2, like publish", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal1" }, async (tx) => {
      await expect(
        tx`select unpublish_listing_locale(${LISTING.ramen}::uuid, 'ja', null)`,
      ).rejects.toThrow(/aal2_required/);
    });
  });
});

describe("transition_menu_version_locale — state machine + role matrix", () => {
  it("rejects an illegal edge (translation_pending → published)", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      await expect(
        tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'published')`,
      ).rejects.toThrow(/invalid_transition/);
    });
  });

  it("editor moves ko into qa_pending; the ko reviewer approves; the ja reviewer cannot", async () => {
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_pending')`;

      // ja reviewer must NOT approve ko (own-locale rule)
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ja"], aal: "aal1" })}, true)`;
      await expectErrorIn(tx, /permission_denied/, (sp) =>
        sp`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_approved')`,
      );

      // ko reviewer approves ko
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ko"], aal: "aal1" })}, true)`;
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_approved')`;
      const row = await tx`select status from menu_version_locales where id = ${MENU.mvlKo}`;
      expect(row[0]!.status).toBe("qa_approved");
    });
  });

  it("external vendor approval (D1) requires aal2 editor+, approval_type and evidence — then publisher publishes", async () => {
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_pending')`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ko"], aal: "aal1" })}, true)`;
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_approved')`;

      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" })}, true)`;

      // approval_type is mandatory
      await expectErrorIn(tx, /approval_type required/, (sp) =>
        sp`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'approved')`,
      );

      // evidence payload is enforced by the constraint trigger
      await expectErrorIn(tx, /menu_evidence_missing/, (sp) =>
        sp`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'approved', 'vendor_approved_external')`,
      );

      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'approved', 'vendor_approved_external', ${MEDIA.ramenEvidenceEn}::uuid)`;
      const approved = await tx`select status, approved_by, approval_type from menu_version_locales where id = ${MENU.mvlKo}`;
      expect(approved[0]!.status).toBe("approved");
      expect(approved[0]!.approved_by).toBe(ACTOR.admin);
      expect(approved[0]!.approval_type).toBe("vendor_approved_external");

      // editor cannot publish; publisher can
      await expectErrorIn(tx, /permission_denied/, (sp) =>
        sp`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'published')`,
      );
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" })}, true)`;
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'published')`;
      const published = await tx`select status from menu_version_locales where id = ${MENU.mvlKo}`;
      expect(published[0]!.status).toBe("published");
    });
  });

  it("ops_agent cannot QA-approve", async () => {
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["ops_agent"], aal: "aal1" }, async (tx) => {
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_pending')`;
      await expect(
        tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_approved')`,
      ).rejects.toThrow(/permission_denied/);
    });
  });

  it("rejected returns to qa_pending (rework loop)", async () => {
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_pending')`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ko"], aal: "aal1" })}, true)`;
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'rejected')`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" })}, true)`;
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_pending')`;
      const row = await tx`select status from menu_version_locales where id = ${MENU.mvlKo}`;
      expect(row[0]!.status).toBe("qa_pending");
    });
  });
});

describe("transition_menu_version_locale — §4 reconciliation (CP2, migration 16)", () => {
  // PRD §4 "Vendor approval of menu": editor "record external (D1)", ops_agent
  // "record external". Platform staff may only RECORD an off-platform written
  // approval — approval_type='portal' is the vendor's own act (Slice 3).

  const stageKoToQaApproved = async (tx: Parameters<Parameters<typeof withClaimsSuper>[1]>[0]) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" })}, true)`;
    await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_pending')`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ko"], aal: "aal1" })}, true)`;
    await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'qa_approved')`;
  };

  it("ops_agent records external vendor approval at aal2 (PRD §4 cell: 'record external')", async () => {
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["ops_agent"], aal: "aal2" }, async (tx) => {
      await stageKoToQaApproved(tx);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.admin, app_roles: ["ops_agent"], aal: "aal2" })}, true)`;
      await tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'approved', 'vendor_approved_external', ${MEDIA.ramenEvidenceEn}::uuid)`;
      const row = await tx`select status, approval_type, approved_by from menu_version_locales where id = ${MENU.mvlKo}`;
      expect(row[0]!.status).toBe("approved");
      expect(row[0]!.approval_type).toBe("vendor_approved_external");
      expect(row[0]!.approved_by).toBe(ACTOR.admin);
    });
  });

  it("ops_agent without aal2 is rejected on the approve edge (uniform aal2, ADR-001)", async () => {
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["ops_agent"], aal: "aal1" }, async (tx) => {
      await stageKoToQaApproved(tx);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.admin, app_roles: ["ops_agent"], aal: "aal1" })}, true)`;
      await expect(
        tx`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'approved', 'vendor_approved_external', ${MEDIA.ramenEvidenceEn}::uuid)`,
      ).rejects.toThrow(/aal2_required/);
    });
  });

  it("approval_type='portal' is rejected for every platform role (D1 — vendor act, Slice 3)", async () => {
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      await stageKoToQaApproved(tx);
      for (const role of ["editor", "ops_agent", "publisher", "super_admin"]) {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.admin, app_roles: [role], aal: "aal2" })}, true)`;
        await expectErrorIn(tx, /approval_type.*vendor_approved_external/, (sp) =>
          sp`select transition_menu_version_locale(${MENU.mvlKo}::uuid, 'approved', 'portal', ${MEDIA.ramenEvidenceEn}::uuid)`,
        );
      }
      const row = await tx`select status from menu_version_locales where id = ${MENU.mvlKo}`;
      expect(row[0]!.status).toBe("qa_approved"); // untouched by the rejected attempts
    });
  });
});

describe("transition_listing_locale — QA workflow (CP2, migration 16)", () => {
  // listing_locales.status is fn-owned (column-scoped grants, migration 18);
  // this fn is the only legal path for the pre-publication ladder. Publish/
  // withdraw stay owned by publish/unpublish_listing_locale. No `stale` edge:
  // D15/ADR-008 — serving locales never leave the serving set via status.
  const publisherClaims = JSON.stringify({ role: "authenticated", sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal2" });

  it("publisher@aal2 stages machine_draft; the ko reviewer walks qa_pending → qa_approved at aal1", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      // sushi/ko is not_started in seed
      await tx`select transition_listing_locale(${LISTING.sushi}::uuid, 'ko', 'machine_draft')`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ko"], aal: "aal1" })}, true)`;
      await tx`select transition_listing_locale(${LISTING.sushi}::uuid, 'ko', 'qa_pending')`;
      await tx`select transition_listing_locale(${LISTING.sushi}::uuid, 'ko', 'qa_approved')`;
      const row = await tx`select status from listing_locales where listing_id = ${LISTING.sushi} and locale = 'ko'`;
      expect(row[0]!.status).toBe("qa_approved");
    });
  });

  it("human-authored content skips machine_draft (not_started → qa_pending; the EN path)", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      await tx`insert into listing_locales (listing_id, locale, status, name) values (${LISTING.coffee}, 'ko', 'not_started', '코나 커피 코너')`;
      await tx`select transition_listing_locale(${LISTING.coffee}::uuid, 'ko', 'qa_pending')`;
      const row = await tx`select status from listing_locales where listing_id = ${LISTING.coffee} and locale = 'ko'`;
      expect(row[0]!.status).toBe("qa_pending");
    });
  });

  it("editor cannot run listing-locale QA edges (PRD §4 'Translation edit/QA approve' marks editor ✖)", async () => {
    await withClaimsSuper({ sub: ACTOR.admin, app_roles: ["editor"], aal: "aal2" }, async (tx) => {
      // coffee/ja is machine_draft in seed
      await expect(
        tx`select transition_listing_locale(${LISTING.coffee}::uuid, 'ja', 'qa_pending')`,
      ).rejects.toThrow(/permission_denied/);
    });
  });

  it("a reviewer cannot touch another locale's rows (own-locale rule)", async () => {
    await withClaimsSuper({ sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ko"], aal: "aal1" }, async (tx) => {
      await expect(
        tx`select transition_listing_locale(${LISTING.coffee}::uuid, 'ja', 'qa_pending')`,
      ).rejects.toThrow(/permission_denied/);
    });
  });

  it("publisher without aal2 gets aal2_required — MFA follows the actor to the DB", async () => {
    await withClaimsSuper({ sub: ACTOR.publisher, app_roles: ["publisher"], aal: "aal1" }, async (tx) => {
      await expect(
        tx`select transition_listing_locale(${LISTING.sushi}::uuid, 'ko', 'machine_draft')`,
      ).rejects.toThrow(/aal2_required/);
    });
  });

  it("rework loop: qa_pending → machine_draft (reviewer own-locale)", async () => {
    await withClaimsSuper({ sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_ko"], aal: "aal1" }, async (tx) => {
      // ramen/ko is qa_pending in seed
      await tx`select transition_listing_locale(${LISTING.ramen}::uuid, 'ko', 'machine_draft')`;
      const row = await tx`select status from listing_locales where listing_id = ${LISTING.ramen} and locale = 'ko'`;
      expect(row[0]!.status).toBe("machine_draft");
    });
  });

  it("vendor-review edges are publisher-only @aal2 (vendor flows arrive Slice 3)", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      // coffee/en is qa_approved in seed
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role: "authenticated", sub: ACTOR.reviewerJa, app_roles: ["language_reviewer_en"], aal: "aal1" })}, true)`;
      await expectErrorIn(tx, /permission_denied/, (sp) =>
        sp`select transition_listing_locale(${LISTING.coffee}::uuid, 'en', 'vendor_review_pending')`,
      );
      await tx`select set_config('request.jwt.claims', ${publisherClaims}, true)`;
      await tx`select transition_listing_locale(${LISTING.coffee}::uuid, 'en', 'vendor_review_pending')`;
      await tx`select transition_listing_locale(${LISTING.coffee}::uuid, 'en', 'vendor_approved')`;
      const row = await tx`select status from listing_locales where listing_id = ${LISTING.coffee} and locale = 'en'`;
      expect(row[0]!.status).toBe("vendor_approved");
    });
  });

  it("rejects published/withdrawn/stale targets — publish is fn-owned elsewhere; no stale edge (D15)", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      for (const target of ["published", "withdrawn", "stale"]) {
        await expectErrorIn(tx, /invalid_transition/, (sp) =>
          sp`select transition_listing_locale(${LISTING.coffee}::uuid, 'en', ${target})`,
        );
      }
    });
  });

  it("rejects an illegal edge (qa_approved → machine_draft) and writes an intent audit row on success", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      await expectErrorIn(tx, /invalid_transition/, (sp) =>
        sp`select transition_listing_locale(${LISTING.coffee}::uuid, 'en', 'machine_draft')`,
      );
      await tx`select transition_listing_locale(${LISTING.sushi}::uuid, 'ko', 'machine_draft')`;
      const audit = await tx`
        select actor, actor_source, before->>'status' as before_status, after->>'status' as after_status
        from audit_log
        where action = 'transition_listing_locale'
          and (after->>'listing_id') = ${LISTING.sushi}
        order by at desc limit 1`;
      expect(audit).toHaveLength(1);
      expect(audit[0]!.actor).toBe(ACTOR.publisher);
      expect(audit[0]!.actor_source).toBe("jwt");
      expect(audit[0]!.before_status).toBe("not_started");
      expect(audit[0]!.after_status).toBe("machine_draft");
    });
  });

  it("rejects a caller with no claims", async () => {
    await withRollback(async (tx) => {
      await expect(
        tx`select transition_listing_locale(${LISTING.sushi}::uuid, 'ko', 'machine_draft')`,
      ).rejects.toThrow(/permission_denied/);
    });
  });
});

describe("execute grants", () => {
  it("anon cannot execute the guarded transition functions", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      await expectErrorIn(tx, /permission denied for function/, (sp) =>
        sp`select publish_listing_locale(${LISTING.ramen}::uuid, 'ja')`,
      );
      await expectErrorIn(tx, /permission denied for function/, (sp) =>
        sp`select transition_listing_locale(${LISTING.sushi}::uuid, 'ko', 'machine_draft')`,
      );
    });
  });

  it("anon cannot execute upsert_provenance or ensure_events_partitions", async () => {
    await withRollback(async (tx) => {
      await tx.unsafe("set local role anon");
      await expectErrorIn(tx, /permission denied for function/, (sp) =>
        sp`select upsert_provenance('listings', ${LISTING.ramen}::uuid, 'name', 'vendor')`,
      );
      await expectErrorIn(tx, /permission denied for function/, (sp) =>
        sp`select ensure_events_partitions(1)`,
      );
    });
  });
});

describe("emergency unpublish path (rollback acceptance, DoD #10)", () => {
  it("full takedown: every serving locale withdrawn + listing unpublished + audit trail", async () => {
    await withClaimsSuper(publisherAal2, async (tx) => {
      const locales = await tx`
        select locale from listing_locales
        where listing_id = ${LISTING.ramen}
          and status in ('qa_approved', 'vendor_approved', 'published')`;
      for (const { locale } of locales) {
        await tx`select unpublish_listing_locale(${LISTING.ramen}::uuid, ${locale}, 'emergency takedown')`;
      }
      const view = await tx`select 1 from publishable_locale_pages where listing_id = ${LISTING.ramen}`;
      expect(view).toEqual([]);
      const audit = await tx`
        select count(*)::int as c from audit_log
        where action = 'unpublish_listing_locale' and (after->>'reason') = 'emergency takedown'`;
      expect(audit[0]!.c).toBe(locales.length);
    });
  });
});
