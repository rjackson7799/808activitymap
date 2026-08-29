import { describe, expect, it } from "vitest";
import { createSecurityHeaders } from "@/config/security-headers";

describe("security headers", () => {
  const headers = new Map(createSecurityHeaders("production").map(({ key, value }) => [key, value]));

  it("sets the browser hardening baseline", () => {
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("keeps the CSP closed to embedding, plugins, and unexpected connections", () => {
    const csp = headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
    expect(csp).not.toContain("http://127.0.0.1");
  });

  it("allows the local Supabase origin outside production", () => {
    const localHeaders = new Map(createSecurityHeaders("test").map(({ key, value }) => [key, value]));
    expect(localHeaders.get("Content-Security-Policy")).toContain("http://127.0.0.1:*");
  });
});
