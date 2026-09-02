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
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  const controlsHaveVisibleSurfaces = await page.evaluate(() => {
    const controls = [
      document.querySelector<HTMLInputElement>("#email"),
      document.querySelector<HTMLInputElement>("#password"),
      document.querySelector<HTMLButtonElement>('button[type="submit"]'),
    ];
    return controls.every((control) => {
      if (!control) return false;
      const style = getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      return (
        rect.height >= 44 &&
        (style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.backgroundImage !== "none") &&
        (style.borderStyle !== "none" || control.tagName === "BUTTON")
      );
    });
  });
  expect(controlsHaveVisibleSurfaces, "login fields and action have visible 44px surfaces").toBe(true);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, "axe violations on /login").toEqual([]);
});

test("admin pages are axe-clean; taxonomy form is keyboard-operable with visible focus", async ({ page }) => {
  const { publisher } = readState();
  await signInWithMfa(page, publisher);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin workspace" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Dashboard" }))
    .toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /taxonomy manage categories/i })).toBeVisible();
  await expect(page.getByText("Two-factor authentication verified for this session.")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  const pageOverflowsMobileViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(pageOverflowsMobileViewport, "admin shell should not overflow the mobile viewport").toBe(false);
  await page.setViewportSize({ width: 1280, height: 720 });

  const paths = [
    "/admin",
    "/admin/taxonomy",
    "/admin/listings",
    "/admin/freshness",
    "/admin/change-requests",
    "/admin/audit",
    "/admin/config",
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
  await expect(page.getByRole("heading", { name: "Taxonomy", exact: true })).toBeVisible();
  await expect(page.getByRole("form", { name: /create category/i })).toBeVisible();
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

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("form", { name: /create category/i })).toBeVisible();
  const taxonomyOverflowsMobileViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(taxonomyOverflowsMobileViewport, "taxonomy should not overflow the mobile viewport").toBe(false);

  await page.goto("/admin/listings");
  await expect(page.getByRole("heading", { name: "Listings", exact: true })).toBeVisible();
  const listingsOverflowMobileViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(listingsOverflowMobileViewport, "listings should not overflow the mobile viewport").toBe(false);

  await page.goto("/admin/change-requests");
  await expect(page.getByRole("heading", { name: "Correction requests", exact: true })).toBeVisible();
  const correctionsOverflowMobileViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(correctionsOverflowMobileViewport, "corrections should not overflow the mobile viewport").toBe(false);

  await page.goto("/admin/freshness");
  await expect(page.getByRole("heading", { name: "Freshness", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configured review windows", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Listing health", exact: true })).toBeVisible();
  const freshnessOverflowsMobileViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(freshnessOverflowsMobileViewport, "freshness should not overflow the mobile viewport").toBe(false);

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit log", exact: true })).toBeVisible();
  const auditOverflowsMobileViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(auditOverflowsMobileViewport, "audit log should not overflow the mobile viewport").toBe(false);
});
