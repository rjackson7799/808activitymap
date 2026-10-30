import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInWithMfa } from "./support/auth";
import { readState, newPg } from "./support/state";

test("editor records and responds to an assisted email update", async ({ page }) => {
  const pg = newPg();
  let messageId = "";
  let requestId = "";
  try {
    const { editor } = readState();
    await signInWithMfa(page, editor);
    await page.goto("/admin/assisted-updates");
    await expect(page.getByRole("heading", { name: "Email & SMS updates" })).toBeVisible();

    const intake = page.getByRole("form", { name: "Record assisted update" });
    await page.getByLabel("Listing").selectOption({ index: 1 });
    await page.getByLabel("Channel").selectOption("email");
    await page.getByLabel("Message language").selectOption("ja");
    await page.getByLabel("Sender email or phone").fill("vendor-e2e@example.com");
    await page.getByLabel("Original message").fill("Please update our Friday closing time to 9 p.m.");
    await page.getByLabel("Requested field").selectOption("hours");
    await page.getByLabel("Correction summary").fill("Friday closing time should be changed to 9 p.m.");
    await intake.getByRole("button", { name: "Record update" }).click();
    await expect(page.getByText("Update recorded and sent to Corrections.")).toBeVisible();

    const card = page.getByRole("article").filter({ hasText: "vendor-e2e@example.com" });
    await expect(card).toBeVisible();
    await expect(card.getByText("Awaiting response", { exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations, "axe on assisted update queue").toEqual([]);

    await card.getByLabel("Response record").fill("Replied by email and confirmed that editorial review is underway.");
    await card.getByRole("button", { name: "Mark responded" }).click();
    await expect(card.getByText("Responded", { exact: true })).toBeVisible();

    const [row] = await pg<{ id: string; linked_change_request_id: string; responded_by: string }[]>`
      select id, linked_change_request_id, responded_by
      from public.assisted_messages where from_address='vendor-e2e@example.com'
      order by created_at desc limit 1`;
    messageId = row!.id;
    requestId = row!.linked_change_request_id;
    expect(row!.responded_by).toBe(editor.userId);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Email & SMS updates" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    if (!messageId) {
      const [row] = await pg<{ id: string; linked_change_request_id: string }[]>`
        select id, linked_change_request_id from public.assisted_messages
        where from_address='vendor-e2e@example.com' order by created_at desc limit 1`;
      messageId = row?.id ?? "";
      requestId = row?.linked_change_request_id ?? "";
    }
    if (messageId) await pg`delete from public.assisted_messages where id=${messageId}`;
    if (requestId) await pg`delete from public.change_requests where id=${requestId}`;
    await pg.end();
  }
});

test("language reviewer cannot access assisted update evidence", async ({ page }) => {
  const { reviewerJa } = readState();
  await signInWithMfa(page, reviewerJa);
  await page.goto("/admin");
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Assisted updates" })).toHaveCount(0);
  await page.goto("/admin/assisted-updates");
  await expect(page).toHaveURL(/\/admin$/);
});
