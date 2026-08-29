import { describe, expect, it } from "vitest";
import { dossierSchema, type Dossier } from "@/scripts/seed/dossier";
import { auditInventory, type InventoryEntry } from "@/scripts/seed/inventory";

function dossier(index: number, overrides: Record<string, unknown> = {}): Dossier {
  return dossierSchema.parse({
    external_ref: `sample-${index}`,
    organization: { name: `Sample ${index}` },
    location: { address: { street: `${index} Test St`, city: "Honolulu", region: "HI", postal_code: "96815", country: "US" }, geo: [21.28, -157.83], phone: "+1-808-555-0100" },
    hours: { mon: "09:00-17:00", tue: "09:00-17:00", wed: "09:00-17:00", thu: "09:00-17:00", fri: "09:00-17:00", sat: "closed", sun: "closed" },
    category: { primary: "cafes-coffee", secondary: [] },
    photos: [{ file: `photo-${index}.jpg`, license: "agreement", granted_by: "Fixture Vendor", alt: `Sample ${index} exterior` }],
    locales: {
      en: { name: `Sample ${index}`, slug: `sample-${index}`, editorial_note: "Reviewed.", seo_title: `Sample ${index}`, seo_desc: "A reviewed fixture." },
      ja: { name: `サンプル${index}`, slug: `サンプル-${index}`, editorial_note: "確認済みです。", seo_title: `サンプル${index}`, seo_desc: "確認済みです。" },
    },
    source: { website: `https://example.com/sample-${index}` },
    verification: { confirmed: true, permission_form: `permission-${index}.pdf`, granted_by: "Fixture Vendor", verified_at: "2026-08-29T20:00:00Z" },
    ...overrides,
  });
}

function input(dossiers: Dossier[]) {
  const entries: InventoryEntry[] = dossiers.map((item, index) => ({ path: `C:/ops/${index}.yaml`, directory: "C:/ops", dossier: item }));
  return { root: "C:/ops", filesScanned: dossiers.length, entries, issues: [] };
}

describe("launch inventory audit", () => {
  it("accepts 25 unique, confirmed, photo-backed EN+JA dossiers", () => {
    const report = auditInventory(input(Array.from({ length: 25 }, (_, index) => dossier(index))), undefined, () => true);
    expect(report).toMatchObject({ ready: true, validDossiers: 25, confirmed: 25, withPhotos: 25, withJapanese: 25, issues: [] });
  });

  it("reports launch-count, permission, photo, Japanese, asset, and uniqueness blockers", () => {
    const first = dossier(1, { photos: [], locales: { en: { name: "Sample 1", slug: "duplicate", editorial_note: "Reviewed.", seo_title: "Sample", seo_desc: "Reviewed." } }, verification: { confirmed: false } });
    const second = dossier(2, { external_ref: "sample-1", locales: { en: { name: "Sample 2", slug: "duplicate", editorial_note: "Reviewed.", seo_title: "Sample", seo_desc: "Reviewed." } } });
    const report = auditInventory(input([first, second]), undefined, () => false);
    expect(new Set(report.issues.map(({ code }) => code))).toEqual(new Set([
      "inventory_count", "verification_unconfirmed", "photo_missing", "ja_missing",
      "duplicate_external_ref", "duplicate_locale_slug", "asset_missing",
    ]));
    expect(report.ready).toBe(false);
  });
});
