import { expect, type Page } from "@playwright/test";
import { totp, secondsLeftInStep } from "./totp";
import type { ProvisionedStaff } from "./staff";

/**
 * Browser sign-in + MFA (CP3). Content-based, not URL-based: the redirect
 * chain (Server Action → proxy → /login/mfa, then MfaPage router.replace back
 * to /admin) has enough Next-internal quirks that asserting on rendered UI is
 * far more robust than on the URL. Robust to two MfaPage realities: a rejected
 * code replaces the form with an error (retry must reload a fresh challenge),
 * and the aal2 session cookie may flush a beat after verify (we confirm by
 * re-loading /admin). Retries across the 30s TOTP window.
 */

const signOutButton = (page: Page) => page.getByRole("button", { name: /sign out/i });
const codeField = (page: Page) => page.getByLabel("Code");

const onAdmin = (page: Page) => signOutButton(page).isVisible().catch(() => false);

async function completeMfa(page: Page, secret: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await onAdmin(page)) return;

    // Make sure a fresh challenge form is on screen (a rejected code removes it).
    if (!(await codeField(page).isVisible().catch(() => false))) {
      await page.goto("/admin"); // aal1 → bounces to the MFA challenge; aal2 → admin
      await page.waitForLoadState();
      if (await onAdmin(page)) return;
      await codeField(page).waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
    }
    if (!(await codeField(page).isVisible().catch(() => false))) continue;

    if (secondsLeftInStep() < 4) await page.waitForTimeout((secondsLeftInStep() + 1) * 1000);
    await codeField(page).fill(totp(secret));
    await expect(page.getByRole("button", { name: /verify/i })).toBeEnabled();
    await page.getByRole("button", { name: /verify/i }).click();
    await page.waitForTimeout(2500); // verify + router.replace + cookie flush

    if (await onAdmin(page)) return;
    // rejected or bounced — wait for a fresh window, then retry a new challenge
    await page.waitForTimeout((secondsLeftInStep() + 1) * 1000);
  }
  throw new Error("MFA was not completed after retries");
}

export async function signInWithMfa(page: Page, user: ProvisionedStaff): Promise<void> {
  // Retry the credential step: a transient GoTrue hiccup re-renders /login with
  // an error alert; a fresh submit usually clears it.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForTimeout(1500); // let the redirect chain settle
    const stuckOnLogin = await page
      .getByRole("heading", { name: /staff sign-in/i })
      .isVisible()
      .catch(() => false);
    const hasError = await page.getByRole("alert").isVisible().catch(() => false);
    if (stuckOnLogin && hasError && attempt < 2) {
      await page.waitForTimeout(4000);
      continue;
    }
    break;
  }
  await completeMfa(page, user.totpSecret);
  await expect(signOutButton(page)).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await signOutButton(page).click();
  await page.waitForURL(/\/login(\/|$)/);
}
