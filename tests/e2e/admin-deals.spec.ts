import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInWithMfa } from "./support/auth";
import { LISTING } from "../db/fixtures";
import { newPg, readState } from "./support/state";

const CODE = "E2E-ALOHA-20";

test("publisher prepares, reviews, activates, and reveals a localized Phase 0 offer", async ({ page }) => {
  const pg = newPg();
  try {
    await pg`delete from deals where reveal_code=${CODE}`;
    const { publisher } = readState();
    await signInWithMfa(page, publisher);
    await page.goto("/admin/deals");
    await expect(page.getByRole("heading", { name: "Deals", exact: true })).toBeVisible();

    const start = new Date(Date.now() - 60 * 60 * 1000);
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const hawaiiLocal = (date: Date) => new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Pacific/Honolulu", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(date).replace(" ", "T");

    const createOffer = page.getByRole("region", { name: "Create offer draft" });
    await createOffer.getByLabel("Listing").selectOption(LISTING.ramen);
    await page.getByLabel("Reveal code").fill(CODE);
    await page.getByLabel("Label this as sponsored content").check();
    await page.getByLabel("Starts (Hawaii time)").fill(hawaiiLocal(start));
    await page.getByLabel("Expires (Hawaii time)").fill(hawaiiLocal(end));
    await page.getByRole("button", { name: "Create offer draft" }).click();

    const card = page.getByRole("article").filter({ hasText: "Aloha Ramen Hale" }).filter({ hasText: CODE });
    await expect(card).toBeVisible();
    const en = card.getByRole("form", { name: "Edit EN offer copy" });
    await en.getByLabel("Title").fill("Twenty percent off dinner");
    await en.getByLabel("Terms").fill("Valid for dine-in dinner orders before expiration. Show the code when ordering.");
    await en.getByRole("button", { name: "Save EN copy" }).click();
    const ja = card.getByRole("form", { name: "Edit JA offer copy" });
    await ja.getByLabel("Title").fill("ディナー20％オフ");
    await ja.getByLabel("Terms").fill("有効期限までの店内ディナーにご利用いただけます。注文時にコードをご提示ください。");
    await ja.getByRole("button", { name: "Save JA copy" }).click();

    await expect(card.getByText("Twenty percent off dinner")).toBeVisible();
    const reviewForms = card.getByRole("form", { name: "Review localized offer" });
    await expect(reviewForms).toHaveCount(2);
    await reviewForms.nth(0).getByRole("button", { name: "Approve wording" }).click();
    await reviewForms.nth(0).getByRole("button", { name: "Approve wording" }).click();
    const activation = card.getByRole("form", { name: "Approve and schedule offer" });
    await activation.getByLabel("Vendor permission evidence").selectOption("f0000000-0000-4000-8000-000000000004");
    await activation.getByRole("button", { name: "Approve and schedule" }).click();
    await expect(card.getByText("Active", { exact: true })).toBeVisible();

    const publicResponse = await page.goto("/spot/aloha-ramen-hale");
    const serverHtml = await publicResponse!.text();
    expect(serverHtml).toContain("Twenty percent off dinner");
    expect(serverHtml).toContain("Valid for dine-in dinner orders before expiration.");
    await expect(page.getByRole("heading", { name: "Current offers" })).toBeVisible();
    await expect(page.getByText("Twenty percent off dinner")).toBeVisible();
    await expect(page.getByText("Sponsored", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reveal offer code" }).click();
    await expect(page.getByText(CODE)).toBeVisible();
    await expect.poll(async () => Number((await pg`select count(*) from events where name='deal_reveal' and props->>'deal_id' in (select id::text from deals where reveal_code=${CODE})`)[0]!.count)).toBe(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Reveal offer code" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await pg`delete from events where name='deal_reveal' and props->>'deal_id' in (select id::text from deals where reveal_code=${CODE})`;
    await pg`delete from deals where reveal_code=${CODE}`;
    await pg.end();
  }
});
