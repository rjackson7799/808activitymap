import { describe, expect, it } from "vitest";
import { isPublicNetworkAddress, validateAffiliateDestination } from "@/lib/affiliate/url";

describe("affiliate destination validation", () => {
  it("accepts a normal public HTTPS tracking URL", () => {
    const result = validateAffiliateDestination("https://partner.example/book?ref=808");
    expect(result.ok).toBe(true);
  });

  it.each([
    "http://partner.example/book",
    "https://localhost/book",
    "https://127.0.0.1/book",
    "https://10.1.2.3/book",
    "https://[::1]/book",
    "https://user:secret@partner.example/book",
    "https://partner.example:8443/book",
  ])("rejects unsafe destination %s", (destination) => {
    expect(validateAffiliateDestination(destination).ok).toBe(false);
  });

  it("classifies private and public resolved addresses", () => {
    expect(isPublicNetworkAddress("192.168.1.2")).toBe(false);
    expect(isPublicNetworkAddress("fd00::1")).toBe(false);
    expect(isPublicNetworkAddress("8.8.8.8")).toBe(true);
    expect(isPublicNetworkAddress("2606:4700:4700::1111")).toBe(true);
  });
});
