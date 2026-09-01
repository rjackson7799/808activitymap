import { describe, expect, it } from "vitest";
import { businessInquirySchema } from "@/lib/business-inquiries/schema";

const valid = {
  locale: "en",
  businessName: "Island Noodle House",
  contactName: "Kai Example",
  email: "kai@example.com",
  phone: "808-555-0100",
  companyWebsite: "https://example.com",
  preferredLanguage: "en",
  message: "I would like to learn about adding an accurate business profile.",
  consent: true,
  website: "",
} as const;

describe("business inquiry input", () => {
  it("accepts a bounded EN or JA inquiry with explicit consent", () => {
    expect(businessInquirySchema.parse(valid)).toEqual(valid);
    expect(businessInquirySchema.safeParse({ ...valid, locale: "ja", preferredLanguage: "ja" }).success).toBe(true);
  });

  it("rejects unsupported locales, missing consent, and short messages", () => {
    expect(businessInquirySchema.safeParse({ ...valid, locale: "ko" }).success).toBe(false);
    expect(businessInquirySchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(businessInquirySchema.safeParse({ ...valid, message: "Call me." }).success).toBe(false);
  });

  it("validates email and optional website without requiring phone", () => {
    expect(businessInquirySchema.safeParse({ ...valid, phone: "", companyWebsite: "" }).success).toBe(true);
    expect(businessInquirySchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(businessInquirySchema.safeParse({ ...valid, companyWebsite: "not a url" }).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(businessInquirySchema.safeParse({ ...valid, claimListing: true }).success).toBe(false);
  });
});
