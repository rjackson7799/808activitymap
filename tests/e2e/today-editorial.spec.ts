import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { newPg } from "./support/state";

const NOTE_ID = "85000000-0000-4000-8000-000000000001";
test.use({ userAgent: "Mozilla/5.0 Chrome/140 Safari/537.36" });

test("weekly editorial is localized, mobile-safe, accessible, discoverable, and measured", async ({ page }) => {
  const pg = newPg();
  try {
    await pg`delete from events where name='today_note_view' and props->>'note_id'=${NOTE_ID}`;
    const response = await page.goto("/today");
    expect(response?.status()).toBe(200);
    expect(await response!.text()).toContain("Both places are compact");
    await expect(page.locator("html")).toHaveAttribute("lang","en");
    await expect(page.getByRole("heading",{level:1,name:"Two counters for an easy Waikīkī evening"})).toBeVisible();
    await expect(page.getByRole("link",{name:/Aloha Ramen Hale/})).toBeVisible();
    await expect.poll(async()=>Number((await pg`select count(*) from events where name='today_note_view' and props->>'note_id'=${NOTE_ID}`)[0]!.count),{timeout:20_000}).toBe(1);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);

    await page.setViewportSize({width:390,height:844});
    await page.reload();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.locator('summary[aria-label="Language"]').click();
    await page.getByRole("link",{name:"日本語"}).click();
    await expect(page.locator("html")).toHaveAttribute("lang","ja");
    await expect(page.getByRole("heading",{level:1,name:"ワイキキで気軽に楽しむ、二つのカウンター"})).toBeVisible();
    expect(await page.evaluate(()=>getComputedStyle(document.querySelector("h1")!).fontFamily)).toContain("Noto Sans JP");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);

    const sitemap=await page.request.get("/sitemap.xml");
    const xml=await sitemap.text();
    expect(xml).toContain("/today");
    expect(xml).toContain("/ja/today");
    expect(xml).not.toContain("/ko/today");
  } finally {
    await pg`delete from events where name='today_note_view' and props->>'note_id'=${NOTE_ID}`;
    await pg.end();
  }
});
