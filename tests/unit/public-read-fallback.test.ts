import { describe, expect, it } from "vitest";
import {
  formatMenuItemPrice,
  resolveAltText,
  resolveEditorialNote,
  resolveName,
  resolveSeo,
} from "@/lib/public-read/fallback";

/**
 * Fallback-matrix engine tests (ADR-008). Name and primary-category label are
 * unreachable at the DTO layer (the eligibility view already requires them in-locale),
 * so their "no fallback" rule is proven HERE, where a regression can actually fail:
 * the resolvers have no parameter through which an EN value could arrive.
 */

describe("resolveName — identity field, no fallback", () => {
  it("returns the in-locale name", () => {
    expect(resolveName("アロハ・ラーメン・ハレ")).toBe("アロハ・ラーメン・ハレ");
  });

  it("throws rather than blank or fall back when the in-locale name is missing", () => {
    expect(() => resolveName(null)).toThrow(/never falls back/);
    expect(() => resolveName("   ")).toThrow(/never falls back/);
  });

  it("has no signature through which an EN value could be supplied", () => {
    // Compile-time guarantee, asserted structurally: one string arg, no EN fallback param.
    expect(resolveName.length).toBe(1);
  });
});

describe("resolveEditorialNote — omit when absent (never EN prose on a non-EN page)", () => {
  it("passes through an in-locale note", () => {
    expect(resolveEditorialNote("close-of-shift favorite")).toBe("close-of-shift favorite");
  });
  it("omits (null) when absent in-locale", () => {
    expect(resolveEditorialNote(null)).toBeNull();
    expect(resolveEditorialNote("  ")).toBeNull();
  });
});

describe("resolveAltText — the one permitted identity fallback (QA'd EN), flagged", () => {
  it("uses the in-locale alt when present, not flagged", () => {
    expect(resolveAltText("味玉入り豚骨ラーメン", "Tonkotsu ramen bowl")).toEqual({
      text: "味玉入り豚骨ラーメン",
      altIsEnFallback: false,
    });
  });
  it("falls back to QA'd EN when the locale alt is missing, and flags it", () => {
    expect(resolveAltText(null, "Counter seating")).toEqual({
      text: "Counter seating",
      altIsEnFallback: true,
    });
  });
  it("returns null (no alt) when neither exists — never fabricates", () => {
    expect(resolveAltText(null, null)).toEqual({ text: null, altIsEnFallback: false });
  });
});

describe("resolveSeo — templated from QA'd locale strings, never EN prose", () => {
  it("passes through an authored in-locale SEO string", () => {
    const seo = resolveSeo({
      localeTitle: "アロハ・ラーメン・ハレ｜ワイキキの豚骨ラーメン",
      localeDescription: "地元公認の豚骨ラーメン店。",
      name: "アロハ・ラーメン・ハレ",
      categoryLabel: "ラーメン",
      marketId: "oahu-waikiki",
      locale: "ja",
    });
    expect(seo.title).toContain("アロハ");
    expect(seo.description).toContain("地元");
  });

  it("composes a JA title from JA strings when absent — no EN words leak", () => {
    const seo = resolveSeo({
      localeTitle: null,
      localeDescription: null,
      name: "アロハ・ラーメン・ハレ",
      categoryLabel: "ラーメン",
      marketId: "oahu-waikiki",
      locale: "ja",
    });
    expect(seo.title).toBe("アロハ・ラーメン・ハレ｜ワイキキのラーメン");
    // No Latin prose from the EN template.
    expect(seo.title).not.toMatch(/\bin\b/);
    expect(seo.description).not.toMatch(/locals-verified/);
  });

  it("composes an EN title from EN strings when absent", () => {
    const seo = resolveSeo({
      localeTitle: null,
      localeDescription: null,
      name: "Aloha Ramen Hale",
      categoryLabel: "Ramen",
      marketId: "oahu-waikiki",
      locale: "en",
    });
    expect(seo.title).toBe("Aloha Ramen Hale — Ramen in Waikīkī");
  });
});

describe("formatMenuItemPrice — money is language-neutral amount + localized chrome, never a fallback", () => {
  const fixed = { priceCents: 1650, currency: "USD", priceType: "fixed" as const };
  const market = { priceCents: null, currency: "USD", priceType: "market" as const };
  const from = { priceCents: 1200, currency: "USD", priceType: "from" as const };

  it("formats a fixed amount identically across locales (the amount is language-neutral)", () => {
    expect(formatMenuItemPrice(fixed, "en")).toBe("$16.50");
    expect(formatMenuItemPrice(fixed, "ja")).toBe("$16.50");
  });

  it("renders market price as a localized label with NO number", () => {
    expect(formatMenuItemPrice(market, "en")).toBe("Market price");
    expect(formatMenuItemPrice(market, "ja")).toBe("時価");
    expect(formatMenuItemPrice(market, "en")).not.toMatch(/\d/);
    expect(formatMenuItemPrice(market, "ja")).not.toMatch(/\d/);
  });

  it("renders a 'from' price with localized chrome around the shared amount", () => {
    expect(formatMenuItemPrice(from, "en")).toBe("From $12.00");
    expect(formatMenuItemPrice(from, "ja")).toBe("$12.00〜");
  });
});
