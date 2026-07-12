import { describe, expect, it } from "vitest";
import { normalizeCategorySlug, validateCategorySlug } from "@/lib/taxonomy/slug";

/**
 * Category slugs are app-normalized to NFC (mirroring migration 13's posture
 * for slug_aliases, where a DB trigger normalizes). Native-script slugs (JA/KO)
 * are stored decoded/NFC; the admin action normalizes on input so the
 * unique(locale, slug) check compares canonical forms.
 */

describe("normalizeCategorySlug", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeCategorySlug("  ramen  ")).toBe("ramen");
  });

  it("normalizes to NFC so decomposed and composed forms collapse", () => {
    // "が" as base か + combining dakuten (NFD) must normalize to the single NFC codepoint
    const nfd = "が"; // か + ◌゙
    const nfc = "が"; // が
    expect(nfd).not.toBe(nfc); // precondition: they differ as raw strings
    expect(normalizeCategorySlug(nfd)).toBe(nfc);
    expect(normalizeCategorySlug(nfd)).toBe(normalizeCategorySlug(nfc));
  });

  it("leaves an already-canonical ASCII slug unchanged", () => {
    expect(normalizeCategorySlug("cafes-coffee")).toBe("cafes-coffee");
  });
});

describe("validateCategorySlug", () => {
  it("accepts a non-empty normalized slug", () => {
    expect(validateCategorySlug("ramen")).toEqual({ ok: true, value: "ramen" });
  });

  it("accepts a native-script slug", () => {
    expect(validateCategorySlug("ラーメン")).toEqual({ ok: true, value: "ラーメン" });
  });

  it("rejects empty / whitespace-only", () => {
    expect(validateCategorySlug("")).toMatchObject({ ok: false });
    expect(validateCategorySlug("   ")).toMatchObject({ ok: false });
  });

  it("rejects a slug containing a slash or whitespace (route-unsafe)", () => {
    expect(validateCategorySlug("a/b")).toMatchObject({ ok: false });
    expect(validateCategorySlug("a b")).toMatchObject({ ok: false });
  });

  it("returns the NFC-normalized value on success", () => {
    const nfd = "が";
    expect(validateCategorySlug(nfd)).toEqual({ ok: true, value: "が" });
  });
});
