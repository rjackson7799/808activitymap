import { describe, expect, it } from "vitest";
import { menuDossierSchema, menuSeedHash } from "@/scripts/seed/menu-dossier";

const valid = {
  listing_external_ref: "sample-cafe", menu_ref: "main-menu",
  source: { file: "menu.pdf", license: "vendor-supplied", granted_by: "Sample Cafe", captured_at: "2026-08-30T00:00:00Z" },
  approval: { file: "approval.pdf", license: "vendor-approval", granted_by: "Sample Cafe" },
  sections: [{ ref: "drinks", position: 0, items: [
    { ref: "coffee", position: 0, price_cents: 500, currency: "USD", price_type: "fixed", owner_pick: true },
    { ref: "catch", position: 1, price_cents: null, currency: "USD", price_type: "market" },
  ] }],
  locales: { en: { sections: [{ ref: "drinks", name: "Drinks", items: [
    { ref: "coffee", name: "Coffee", human_confirmed: true },
    { ref: "catch", name: "Catch of the day", human_confirmed: true },
  ] }] } },
};

describe("permissioned menu dossier", () => {
  it("accepts a complete locale and produces a stable content hash", () => {
    const parsed = menuDossierSchema.parse(valid);
    expect(parsed.version).toBe(1);
    expect(menuSeedHash(parsed)).toBe(menuSeedHash(parsed));
  });
  it("accepts an explicit later version", () => {
    expect(menuDossierSchema.parse({ ...valid, version: 2 }).version).toBe(2);
  });
  it("rejects locale item gaps", () => expect(() => menuDossierSchema.parse({
    ...valid, locales: { en: { sections: [{ ref: "drinks", name: "Drinks", items: [{ ref: "coffee", name: "Coffee" }] }] } },
  })).toThrow(/every section item/));
  it("rejects amounts on market prices", () => expect(() => menuDossierSchema.parse({
    ...valid, sections: [{ ref: "drinks", position: 0, items: [{ ref: "catch", position: 0, price_cents: 100, price_type: "market" }] }],
    locales: { en: { sections: [{ ref: "drinks", name: "Drinks", items: [{ ref: "catch", name: "Catch" }] }] } },
  })).toThrow(/market price/));
  it("requires amounts for fixed prices", () => expect(() => menuDossierSchema.parse({
    ...valid, sections: [{ ref: "drinks", position: 0, items: [{ ref: "coffee", position: 0, price_type: "fixed" }] }],
    locales: { en: { sections: [{ ref: "drinks", name: "Drinks", items: [{ ref: "coffee", name: "Coffee" }] }] } },
  })).toThrow(/requires price_cents/));
});
