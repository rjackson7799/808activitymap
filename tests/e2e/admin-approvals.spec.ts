import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInWithMfa } from "./support/auth";
import { FIXTURE } from "./support/fixture";
import { newPg, readState } from "./support/state";

test("editor records external menu approval from the Phase 0 approval queue", async ({ page }) => {
  const pg = newPg();
  const { editor } = readState();

  try {
    await pg`update menu_version_locales
      set status = 'qa_approved', approval_type = null, approval_evidence_media_id = null,
          approved_by = null, approved_at = null
      where id = ${FIXTURE.mvlEn}`;

    await signInWithMfa(page, editor);
    await page.goto("/admin");
    await page.getByRole("link", { name: /menu approvals track written vendor sign-off/i }).click();

    await expect(page.getByRole("heading", { name: "Menu approvals", exact: true })).toBeVisible();
    await expect(page.getByText("External-approval recording enabled")).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: "E2E Ramen House" }).filter({ hasText: "English" });
    await expect(card).toContainText("QA Approved");
    await card.getByLabel("Signed approval evidence").selectOption({ label: "e2e/approval.pdf" });
    await card.getByRole("button", { name: "Record external approval" }).click();
    await expect(card.getByText("Approved", { exact: true })).toBeVisible();

    const [record] = await pg<{ status: string; approval_type: string; approval_evidence_media_id: string; approved_by: string }[]>`
      select status, approval_type, approval_evidence_media_id, approved_by
      from menu_version_locales where id = ${FIXTURE.mvlEn}`;
    expect(record).toEqual({
      status: "approved",
      approval_type: "vendor_approved_external",
      approval_evidence_media_id: FIXTURE.evidence,
      approved_by: editor.userId,
    });

    await page.reload();
    await expect(card).toContainText("Vendor Approved External");
    await expect(card).toContainText("e2e/approval.pdf");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on mobile approval queue").toEqual([]);
  } finally {
    await pg`update menu_version_locales
      set status = 'qa_approved', approval_type = null, approval_evidence_media_id = null,
          approved_by = null, approved_at = null
      where id = ${FIXTURE.mvlEn}`;
    await pg.end();
  }
});

test("language reviewer can track approvals but cannot record them", async ({ page }) => {
  const { reviewerJa } = readState();
  await signInWithMfa(page, reviewerJa);
  await page.goto("/admin/approvals");
  await expect(page.getByRole("heading", { name: "Menu approvals", exact: true })).toBeVisible();
  await expect(page.getByText("Read-only approval tracking")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record external approval" })).toHaveCount(0);
});
