import { test, expect } from "@playwright/test";
import { signInWithMfa } from "./support/auth";
import { readState, newPg } from "./support/state";

/**
 * Taxonomy create + the "clean surfaced validation error" the slice requires:
 * a second category with the same (locale, slug) surfaces an inline, slug-
 * scoped field error — the full stack (form → guarded action → RLS insert →
 * 23505 → shared mapper → inline UI error).
 */

test("taxonomy: create a category, then a duplicate slug surfaces a clean field error", async ({ page }) => {
  const { publisher } = readState();
  const pg = newPg();
  const slug = "e2e-dup-slug-cat";

  try {
    await signInWithMfa(page, publisher);
    await page.goto("/admin/taxonomy");

    // create a category (EN label + slug)
    await page.getByLabel("Label (English)").fill("E2E Dup Category");
    await page.getByLabel("Slug (English)").fill(slug);
    await page.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByText("Category created.")).toBeVisible();

    // a second create with the SAME slug → clean, slug-scoped validation error
    await page.getByLabel("Label (English)").fill("E2E Dup Category Two");
    await page.getByLabel("Slug (English)").fill(slug);
    await page.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /slug/i })).toBeVisible();
  } finally {
    // remove the created category (cascade clears its locale); the second
    // attempt's shell was already compensated-deleted by the action
    await pg`delete from categories where id in (
      select category_id from category_locales where slug = ${slug})`;
    await pg.end();
  }
});
