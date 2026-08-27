import type postgres from "postgres";

/**
 * The E2E publish fixture (CP3) — a self-contained listing in a KNOWN state,
 * built via direct pg (superuser) so it is deterministic and fully torn down
 * afterwards. Distinct `d0…` UUID namespace so it never collides with the seed.
 *
 * State: fully publishable in EN + JA EXCEPT the EN locale starts at
 * `qa_pending` (the blocked-publish beat), and the menu locales start at
 * `qa_approved` (the menu-evidence beat resolves at approval). The primary
 * category is the seed `ramen` category (active, EN+JA labels/slugs).
 */

export const FIXTURE = {
  org: "d0000000-0000-4000-8000-000000000001",
  loc: "d0000000-0000-4000-8000-000000000002",
  hours: "d0000000-0000-4000-8000-000000000003",
  photo: "d0000000-0000-4000-8000-000000000004",
  evidence: "d0000000-0000-4000-8000-000000000005",
  menuSource: "d0000000-0000-4000-8000-000000000006",
  listing: "d0000000-0000-4000-8000-000000000010",
  llEn: "d0000000-0000-4000-8000-000000000011",
  llJa: "d0000000-0000-4000-8000-000000000012",
  menuDoc: "d0000000-0000-4000-8000-000000000020",
  menuVer: "d0000000-0000-4000-8000-000000000021",
  mvlEn: "d0000000-0000-4000-8000-000000000022",
  mvlJa: "d0000000-0000-4000-8000-000000000023",
  // seed category — active, publicly_visible, EN+JA label+slug present
  ramenCat: "e0000000-0000-4000-8000-000000000011",
  // provenance/approval placeholder actor (no FK to auth.users by design)
  actor: "99000000-0000-4000-8000-000000000002",
} as const;

export async function teardownPublishFixture(pg: postgres.Sql): Promise<void> {
  // NOTE: provenance is permanent (immutability guard, migration 12) — it is
  // NEVER deleted. Rebuilds supersede it via upsert_provenance instead, so we
  // leave the history rows in place here.
  // listing cascade removes locales, categories, media links, and the menu chain
  await pg`delete from public.listings where id = ${FIXTURE.listing}`;
  await pg`delete from public.media where id in (${FIXTURE.photo}, ${FIXTURE.evidence}, ${FIXTURE.menuSource})`;
  await pg`delete from public.locations where id = ${FIXTURE.loc}`;
  await pg`delete from public.organizations where id = ${FIXTURE.org}`;
}

export async function buildPublishFixture(pg: postgres.Sql): Promise<void> {
  await teardownPublishFixture(pg); // idempotent: start clean

  await pg.begin(async (tx) => {
    await tx`insert into public.organizations (id, name, legal_name)
             values (${FIXTURE.org}, 'E2E Ramen', 'E2E Ramen LLC')`;

    await tx`insert into public.locations (id, organization_id, address, geo_lat, geo_lng, phone)
             values (${FIXTURE.loc}, ${FIXTURE.org},
                     '{"street":"1 E2E Way","city":"Honolulu","region":"HI","postal_code":"96815","country":"US"}'::jsonb,
                     21.2800, -157.8300, '+1-808-555-0199')`;

    await tx`insert into public.hours_sets (id, location_id, weekly, unknown)
             values (${FIXTURE.hours}, ${FIXTURE.loc},
                     '{"mon":{"spans":[{"open":"11:00","close":"21:00"}]},"tue":{"spans":[{"open":"11:00","close":"21:00"}]},"wed":{"spans":[{"open":"11:00","close":"21:00"}]},"thu":{"spans":[{"open":"11:00","close":"21:00"}]},"fri":{"spans":[{"open":"11:00","close":"21:00"}]},"sat":{"spans":[{"open":"11:00","close":"21:00"}]},"sun":{"closed":true}}'::jsonb,
                     false)`;

    await tx`insert into public.media (id, bucket, path, kind, rights, moderation_status, uploaded_by) values
             (${FIXTURE.photo}, 'public-photos', 'e2e/photo.webp', 'photo',
              '{"license":"vendor_agreement_v1","granted_by":"E2E Ramen LLC","agreement_ref":"E2E-1"}'::jsonb, 'approved', ${FIXTURE.actor}),
             (${FIXTURE.evidence}, 'evidence', 'e2e/approval.pdf', 'evidence',
              '{"license":"approval_form_v1","granted_by":"E2E Ramen LLC","agreement_ref":"E2E-APPR"}'::jsonb, 'approved', ${FIXTURE.actor}),
             (${FIXTURE.menuSource}, 'menu-sources', 'e2e/menu.pdf', 'menu_source',
              '{"license":"vendor_supplied","granted_by":"E2E Ramen LLC","agreement_ref":"E2E-1"}'::jsonb, 'approved', ${FIXTURE.actor})`;

    await tx`insert into public.listings (id, location_id, publication_status, price_band)
             values (${FIXTURE.listing}, ${FIXTURE.loc}, 'unpublished', '$$')`;
    await tx`insert into public.listing_categories (listing_id, category_id)
             values (${FIXTURE.listing}, ${FIXTURE.ramenCat})`;
    await tx`update public.listings set primary_category_id = ${FIXTURE.ramenCat} where id = ${FIXTURE.listing}`;
    await tx`insert into public.listing_media (listing_id, media_id, position)
             values (${FIXTURE.listing}, ${FIXTURE.photo}, 0)`;

    await tx`insert into public.listing_locales (id, listing_id, locale, status, name, slug, seo_title, seo_desc) values
             (${FIXTURE.llEn}, ${FIXTURE.listing}, 'en', 'qa_pending', 'E2E Ramen House', 'e2e-ramen-house',
              'E2E Ramen House', 'A fixture listing for the admin publish journey.'),
             (${FIXTURE.llJa}, ${FIXTURE.listing}, 'ja', 'qa_approved', 'E2Eラーメンハウス', 'e2e-ramen-house-ja',
              'E2Eラーメンハウス｜ワイキキ', 'ワイキキのフィクスチャ掲載。')`;

    // provenance is write-once-per-current via upsert_provenance (the only
    // legal write path); it supersedes any rows left by a prior run.
    await tx`select upsert_provenance('listings', ${FIXTURE.listing}::uuid, 'name', 'vendor', 'onboarding_form', ${FIXTURE.actor}::uuid, null, 'approved', now() + interval '365 days')`;
    await tx`select upsert_provenance('locations', ${FIXTURE.loc}::uuid, 'address', 'vendor', 'onboarding_form', ${FIXTURE.actor}::uuid, null, 'approved', now() + interval '365 days')`;
    await tx`select upsert_provenance('locations', ${FIXTURE.loc}::uuid, 'hours', 'vendor', 'hours_confirmation', ${FIXTURE.actor}::uuid, null, 'approved', now() + interval '90 days')`;

    await tx`insert into public.menu_documents (id, listing_id, source_media_id, captured_at, captured_by)
             values (${FIXTURE.menuDoc}, ${FIXTURE.listing}, ${FIXTURE.menuSource}, now(), ${FIXTURE.actor})`;
    await tx`insert into public.menu_versions (id, menu_document_id, version, status)
             values (${FIXTURE.menuVer}, ${FIXTURE.menuDoc}, 1, 'active')`;
    await tx`insert into public.menu_version_locales (id, menu_version_id, locale, status) values
             (${FIXTURE.mvlEn}, ${FIXTURE.menuVer}, 'en', 'qa_approved'),
             (${FIXTURE.mvlJa}, ${FIXTURE.menuVer}, 'ja', 'qa_approved')`;
  });

  // Fail fast if the fixture doesn't match the journey's premises, so a gap
  // surfaces here with a clear message instead of deep in the browser.
  const en = await pg<{ blocker_code: string }[]>`
    select blocker_code from public.can_publish_listing_locale(${FIXTURE.listing}::uuid, 'en')`;
  const ja = await pg<{ blocker_code: string }[]>`
    select blocker_code from public.can_publish_listing_locale(${FIXTURE.listing}::uuid, 'ja')`;
  const enCodes = en.map((r) => r.blocker_code);
  const jaCodes = ja.map((r) => r.blocker_code);
  if (enCodes.length !== 1 || enCodes[0] !== "locale_status_insufficient") {
    throw new Error(`fixture EN gate expected [locale_status_insufficient], got [${enCodes.join(", ")}]`);
  }
  if (jaCodes.length !== 0) {
    throw new Error(`fixture JA gate expected [] (publishable), got [${jaCodes.join(", ")}]`);
  }
}
