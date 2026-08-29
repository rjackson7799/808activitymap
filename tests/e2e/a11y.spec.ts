import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInWithMfa } from "./support/auth";
import { readState } from "./support/state";
import { FIXTURE } from "./support/fixture";

/**
 * Accessibility (CP3): axe on login + the admin surface, plus keyboard nav,
 * visible focus, and `lang` attributes. Runs first (alphabetical) while the
 * publish fixture is still pristine.
 */

test("login is axe-clean and declares its language", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, "axe violations on /login").toEqual([]);
});

test("admin pages are axe-clean; taxonomy form is keyboard-operable with visible focus", async ({ page }) => {
  const { publisher } = readState();
  await signInWithMfa(page, publisher);

  const paths = [
    "/admin",
    "/admin/taxonomy",
    "/admin/listings",
    "/admin/change-requests",
    `/admin/listings/${FIXTURE.listing}`,
    "/login/mfa", // reachable with a session — challenge UI must be a11y-clean too
  ];
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `axe violations on ${path}`).toEqual([]);
  }

  // keyboard operability + visible focus on the taxonomy create form
  await page.goto("/admin/taxonomy");
  const label = page.getByLabel("Label (English)");
  await label.focus();
  await expect(label).toBeFocused();
  // focus ring is not globally suppressed
  const focusRingPresent = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.outlineStyle !== "none" || s.boxShadow !== "none";
  });
  expect(focusRingPresent).toBe(true);
  // Tab advances to the slug field, then the create controls remain reachable
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Slug (English)")).toBeFocused();
  await expect(page.getByRole("form", { name: /create category/i })).toBeVisible();
});
