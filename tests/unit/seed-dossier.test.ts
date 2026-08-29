import { describe, expect, it } from "vitest";
import { deterministicUuid, dossierSchema, normalizeHours } from "@/scripts/seed/dossier";

const valid = {
  external_ref: "sample-cafe", organization: { name: "Sample Cafe" },
  location: { address: { street: "1 Test St", city: "Honolulu", region: "HI", postal_code: "96815", country: "US" }, geo: [21.28, -157.83], phone: "+1-808-555-0100" },
  hours: { mon: "09:00-17:00", tue: "09:00-17:00", wed: "09:00-17:00", thu: "09:00-17:00", fri: "09:00-17:00", sat: "closed", sun: "24h" },
  category: { primary: "cafes-coffee", secondary: [] }, photos: [],
  locales: { en: { name: "Sample Cafe", editorial_note: "A sample.", seo_title: "Sample", seo_desc: "Sample cafe." } },
  source: { website: "https://example.com" }, verification: { confirmed: false },
};

describe("permissioned seed dossier", () => {
  it("validates a first-party unconfirmed draft", () => expect(dossierSchema.parse(valid).verification.confirmed).toBe(false));
  it("rejects insecure source URLs", () => expect(() => dossierSchema.parse({ ...valid, source: { website: "http://example.com" } })).toThrow());
  it("requires evidence for confirmed verification", () => expect(() => dossierSchema.parse({ ...valid, verification: { confirmed: true } })).toThrow());
  it("creates stable, entity-specific UUIDs", () => {
    expect(deterministicUuid("sample-cafe", "listing")).toBe(deterministicUuid("sample-cafe", "listing"));
    expect(deterministicUuid("sample-cafe", "listing")).not.toBe(deterministicUuid("sample-cafe", "location"));
  });
  it("normalizes closed, 24-hour, and span days", () => expect(normalizeHours(valid.hours as never)).toMatchObject({ mon: { spans: [{ open: "09:00", close: "17:00" }] }, sat: { closed: true }, sun: { is24h: true } }));
});
