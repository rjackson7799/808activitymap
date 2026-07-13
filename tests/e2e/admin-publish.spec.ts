import { test, expect } from "@playwright/test";
import { signInWithMfa } from "./support/auth";
import { readState, newPg } from "./support/state";
import { FIXTURE } from "./support/fixture";

/**
 * The admin publish journey (CP3 exit criterion). Two blocked→resolve beats:
 *  B) a real blocked PUBLISH (EN at qa_pending → locale_status_insufficient),
 *     resolved via the QA-transition control (exercises transition_listing_locale);
 *  A) menu_evidence_missing at the approval transition, resolved by attaching
 *     the evidence document (exercises transition_menu_version_locale).
 * Then publish EN+JA, editor denied the same action (+ no leaked audit row),
 * audit rows attributed to the publisher, and unpublish.
 *
 * Two browser contexts (publisher signed in throughout; editor in parallel) so
 * the journey needs just two sign-ins — no MFA sign-out/in churn. Public-
 * visibility / sitemap / ISR legs are CP4 (see the fixme at the end).
 */

test("admin publish journey: blocked publish + menu evidence → resolve → publish EN+JA → editor denied → unpublish", async ({
  browser,
}) => {
  const { publisher, editor } = readState();
  const listingUrl = `/admin/listings/${FIXTURE.listing}`;
  const pg = newPg();
  const pubCtx = await browser.newContext();
  const edCtx = await browser.newContext();
  const pub = await pubCtx.newPage();
  const ed = await edCtx.newPage();

  try {
    // audit_log is append-only (permanent across runs) and the fixture reuses
    // fixed UUIDs — scope every audit assertion to rows written after now.
    const t0 = (await pg<{ now: Date }[]>`select now() as now`)[0]!.now;
    // 1 ── publisher (super_admin) signs in with MFA
    await signInWithMfa(pub, publisher);
    await pub.goto(listingUrl);
    await expect(pub.getByTestId("status-en")).toHaveText("qa_pending");
    await expect(pub.getByTestId("status-ja")).toHaveText("qa_approved");
    await expect(pub.getByLabel("en publish blockers")).toContainText("locale_status_insufficient");

    // 2 ── Beat B: publishing EN is blocked, then resolved via the QA ladder
    const enControls = pub.getByTestId("locale-en");
    await enControls.getByRole("button", { name: "Publish en", exact: true }).click();
    await expect(enControls.getByTestId("action-error").first()).toHaveAttribute(
      "data-error-code",
      "publication_blocked",
    );
    await enControls.getByRole("button", { name: "Approve en QA" }).click();
    await expect(pub.getByTestId("status-en")).toHaveText("qa_approved");

    // 3 ── Beat A: record menu approval WITHOUT evidence → menu_evidence_missing
    const menuEn = pub.getByTestId("menu-en");
    await menuEn.getByLabel("Approval evidence").selectOption("");
    await menuEn.getByRole("button", { name: /record vendor approval/i }).click();
    await expect(menuEn.getByTestId("action-error")).toHaveAttribute("data-error-code", "menu_evidence_missing");
    await menuEn.getByLabel("Approval evidence").selectOption({ label: "e2e/approval.pdf" });
    await menuEn.getByRole("button", { name: /record vendor approval/i }).click();
    await expect(pub.getByTestId("menu-status-en")).toHaveText("approved");

    // 4 ── publish EN + JA
    await pub.getByTestId("locale-en").getByRole("button", { name: "Publish en", exact: true }).click();
    await expect(pub.getByTestId("status-en")).toHaveText("published");
    await pub.getByTestId("locale-ja").getByRole("button", { name: "Publish ja", exact: true }).click();
    await expect(pub.getByTestId("status-ja")).toHaveText("published");
    await expect(pub.getByTestId("publication-status")).toHaveText("published");

    // 5 ── audit rows for the publishes, attributed to the publisher (auth.uid())
    const pubRows = await pg<{ actor: string }[]>`
      select actor from audit_log
      where action = 'publish_listing_locale' and target_id in (${FIXTURE.llEn}, ${FIXTURE.llJa})
        and at >= ${t0}`;
    expect(pubRows.length).toBeGreaterThanOrEqual(2);
    for (const r of pubRows) expect(r.actor).toBe(publisher.userId);

    // 6 ── editor denied the same action (handler forbids; nothing leaks)
    await signInWithMfa(ed, editor);
    await ed.goto(listingUrl);
    const enForEditor = ed.getByTestId("locale-en");
    await enForEditor.getByRole("button", { name: "Unpublish en" }).click();
    await expect(enForEditor.getByTestId("action-error").first()).toHaveAttribute("data-error-code", "forbidden");
    const leaked = await pg`select 1 from audit_log
      where action = 'unpublish_listing_locale' and target_id = ${FIXTURE.llEn} and at >= ${t0}`;
    expect(leaked.length).toBe(0);
    await expect(ed.getByTestId("status-en")).toHaveText("published");

    // 7 ── publisher unpublishes EN + JA (still signed in on the pub context)
    await pub.goto(listingUrl);
    await pub.getByTestId("locale-en").getByRole("button", { name: "Unpublish en" }).click();
    await expect(pub.getByTestId("status-en")).toHaveText("withdrawn");
    await pub.getByTestId("locale-ja").getByRole("button", { name: "Unpublish ja" }).click();
    await expect(pub.getByTestId("status-ja")).toHaveText("withdrawn");
    await expect(pub.getByTestId("publication-status")).toHaveText("unpublished");

    const unpubRows = await pg`select 1 from audit_log
      where action = 'unpublish_listing_locale' and target_id in (${FIXTURE.llEn}, ${FIXTURE.llJa})
        and at >= ${t0}`;
    expect(unpubRows.length).toBeGreaterThanOrEqual(2);
  } finally {
    await pg.end();
    await pubCtx.close();
    await edCtx.close();
  }
});

/**
 * CP4: the deferred public-visibility legs of DoD #4. Publishing/unpublishing goes
 * through the admin UI (server actions) so the CP4 updateTag revalidation fires; the
 * public surface is then polled (expect.toPass — tag invalidation propagates within the
 * ISR window, it is not asserted once). The JA locale (ASCII slug e2e-ramen-house-ja) is
 * used; the journey may have left it withdrawn, so we re-approve it via pg first.
 */
test("published listing appears on the public surface + sitemap; unpublish removes it within the ISR window", async ({
  browser,
  request,
}) => {
  const { publisher } = readState();
  const pg = newPg();
  const listingUrl = `/admin/listings/${FIXTURE.listing}`;
  const publicPath = "/ja/spot/e2e-ramen-house-ja";
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    // Precondition: JA locale publishable (the journey above leaves it withdrawn).
    await pg`update public.listing_locales set status = 'qa_approved'
             where id = ${FIXTURE.llJa} and status <> 'published'`;

    await signInWithMfa(page, publisher);
    await page.goto(listingUrl);
    await page.getByTestId("locale-ja").getByRole("button", { name: "Publish ja", exact: true }).click();
    await expect(page.getByTestId("status-ja")).toHaveText("published");

    // Public JA page renders + the sitemap lists it (within the ISR window).
    await expect(async () => {
      const res = await request.get(publicPath);
      expect(res.status()).toBe(200);
      expect(await res.text()).toContain("E2Eラーメンハウス");
    }).toPass({ timeout: 20_000 });
    await expect(async () => {
      expect(await (await request.get("/sitemap.xml")).text()).toContain(publicPath);
    }).toPass({ timeout: 20_000 });

    // Unpublish → removed from the public page AND the sitemap within the ISR window.
    await page.goto(listingUrl);
    await page.getByTestId("locale-ja").getByRole("button", { name: "Unpublish ja" }).click();
    await expect(page.getByTestId("status-ja")).toHaveText("withdrawn");

    await expect(async () => {
      const res = await request.get(publicPath);
      expect(res.status()).toBe(404);
    }).toPass({ timeout: 20_000 });
    await expect(async () => {
      expect(await (await request.get("/sitemap.xml")).text()).not.toContain(publicPath);
    }).toPass({ timeout: 20_000 });
  } finally {
    await pg.end();
    await ctx.close();
  }
});
