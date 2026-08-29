import { describe, expect, it } from "vitest";
import { correctionRequestSchema } from "@/lib/corrections/schema";

const valid = {
  listingId: "c0000000-0000-4000-8000-000000000001",
  locale: "en",
  field: "hours",
  details: "The shop now closes at 8 p.m. on weekdays.",
  name: "A local visitor",
  email: "visitor@example.com",
  website: "",
};

describe("correction request input", () => {
  it("accepts a bounded listing-scoped correction", () => {
    expect(correctionRequestSchema.parse(valid)).toEqual(valid);
  });

  it("rejects unknown fields and short or oversized reports", () => {
    expect(correctionRequestSchema.safeParse({ ...valid, field: "ranking" }).success).toBe(false);
    expect(correctionRequestSchema.safeParse({ ...valid, details: "too short" }).success).toBe(false);
    expect(correctionRequestSchema.safeParse({ ...valid, details: "x".repeat(2001) }).success).toBe(false);
  });

  it("allows blank contact details but validates supplied email", () => {
    expect(correctionRequestSchema.safeParse({ ...valid, name: "", email: "" }).success).toBe(true);
    expect(correctionRequestSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });
});

