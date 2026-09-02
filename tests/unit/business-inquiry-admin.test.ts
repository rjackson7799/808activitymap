import { describe, expect, it } from "vitest";
import { BUSINESS_INQUIRY_STAFF_ROLES, canManageBusinessInquiries } from "@/lib/business-inquiries/admin";

describe("business inquiry admin roles", () => {
  it("limits contact-detail access to operations roles", () => {
    expect(BUSINESS_INQUIRY_STAFF_ROLES).toEqual(["super_admin", "editor", "ops_agent"]);
    expect(canManageBusinessInquiries(["super_admin"])).toBe(true);
    expect(canManageBusinessInquiries(["editor"])).toBe(true);
    expect(canManageBusinessInquiries(["ops_agent"])).toBe(true);
  });

  it("does not expose the inquiry queue to unrelated staff roles", () => {
    expect(canManageBusinessInquiries(["publisher"])).toBe(false);
    expect(canManageBusinessInquiries(["language_reviewer_ja"])).toBe(false);
    expect(canManageBusinessInquiries(["language_reviewer_ko"])).toBe(false);
    expect(canManageBusinessInquiries([])).toBe(false);
  });
});
