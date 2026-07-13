import { test, expect } from "@playwright/test";

/**
 * JS-free content pass (CP4 DoD): runs in the `chromium-nojs` project with
 * javaScriptEnabled=false. The public surface is server-rendered, so ALL content must be
 * present without JavaScript — only the live open-now pill is a progressive enhancement.
 */

test("home renders category browse without JS", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ramen/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Sushi/ }).first()).toBeVisible();
});

test("category renders listing cards without JS", async ({ page }) => {
  await page.goto("/ramen");
  await expect(page.getByRole("link", { name: /Aloha Ramen Hale/ })).toBeVisible();
});

test("listing renders name, menu, hours, and provenance without JS", async ({ page }) => {
  await page.goto("/spot/aloha-ramen-hale");
  await expect(page.getByRole("heading", { level: 1, name: "Aloha Ramen Hale" })).toBeVisible();
  await expect(page.getByText("Tonkotsu Ramen")).toBeVisible();
  await expect(page.getByText("$16.50")).toBeVisible();
  await expect(page.getByText("Market price", { exact: true })).toBeVisible(); // localized label, no number
  await expect(page.getByRole("heading", { name: "How we keep this current" })).toBeVisible();
  // Hours table (server-rendered content) is present even without the live open-now pill.
  await expect(page.getByRole("cell", { name: "11:00–14:30" }).first()).toBeVisible();
});

test("JA listing renders native content + correct lang without JS", async ({ page }) => {
  await page.goto("/ja/spot/アロハラーメンハレ");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("heading", { level: 1, name: "アロハ・ラーメン・ハレ" })).toBeVisible();
  await expect(page.getByText("豚骨ラーメン")).toBeVisible();
});
