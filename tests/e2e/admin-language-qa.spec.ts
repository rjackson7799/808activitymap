import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInWithMfa } from "./support/auth";
import { FIXTURE } from "./support/fixture";
import { newPg, readState } from "./support/state";

test("Japanese reviewer claims, edits, times, and approves listing QA", async ({ page }) => {
  const pg = newPg();
  const { reviewerJa } = readState();
  try {
    await pg`delete from qa_work_sessions where assignment_id in (select id from qa_assignments where target_id=${FIXTURE.llJa})`;
    await pg`delete from qa_assignments where target_id=${FIXTURE.llJa}`;
    await pg`update listing_locales set status='qa_pending' where id=${FIXTURE.llJa}`;

    await signInWithMfa(page, reviewerJa);
    await page.goto("/admin/qa/ja");
    await expect(page.getByRole("heading", { name: "Japanese QA queue" })).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: "E2E Ramen House" }).filter({ hasText: "Listing page" });
    await expect(card).toContainText("Unassigned");
    await card.getByRole("button", { name: "Claim item" }).click();
    await expect(card.getByRole("button", { name: "Start work timer" })).toBeVisible();
    await card.getByRole("button", { name: "Start work timer" }).click();
    await expect(card).toContainText("Running");
    await card.getByLabel("SEO title").fill("E2Eラーメンハウス｜日本語QA済み");
    await card.getByRole("button", { name: "Save listing translation" }).click();
    await expect(card.getByText("Saved.")).toBeVisible();
    await card.getByRole("button", { name: "Approve QA" }).click();
    await expect(card).toHaveCount(0);

    const [locale] = await pg`select status,seo_title from listing_locales where id=${FIXTURE.llJa}`;
    expect(locale).toEqual({ status: "qa_approved", seo_title: "E2Eラーメンハウス｜日本語QA済み" });
    const [assignment] = await pg`select assigned_to,outcome,completed_at is not null as complete from qa_assignments where target_id=${FIXTURE.llJa}`;
    expect(assignment).toEqual({ assigned_to: reviewerJa.userId, outcome: "approved", complete: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/qa/ja");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await pg`update listing_locales set status='qa_approved',seo_title='E2Eラーメンハウス｜ワイキキ' where id=${FIXTURE.llJa}`;
    await pg`delete from qa_work_sessions where assignment_id in (select id from qa_assignments where target_id=${FIXTURE.llJa})`;
    await pg`delete from qa_assignments where target_id=${FIXTURE.llJa}`;
    await pg.end();
  }
});

test("editor can monitor language QA but cannot change it", async ({ page }) => {
  const { editor } = readState();
  await signInWithMfa(page, editor);
  await page.goto("/admin/qa/ko");
  await expect(page.getByRole("heading", { name: "Korean QA queue" })).toBeVisible();
  await expect(page.getByText("Queue monitoring only")).toBeVisible();
  await expect(page.getByRole("button", { name: /claim item|approve qa/i })).toHaveCount(0);
});

