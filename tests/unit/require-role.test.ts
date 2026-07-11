import { describe, expect, it } from "vitest";
import { AuthzError, assertRole, parseVerifiedClaims } from "@/lib/auth/claims";

/**
 * Handler-side half of the CP2 exit criterion: a privileged action without
 * aal2 is rejected at the handler (the DB half lives in the rls/transitions
 * suites). assertRole is the pure core requireRole() delegates to after
 * fetching VERIFIED claims via supabase.auth.getClaims() — never
 * getSession(), which trusts an unverified local cookie parse.
 */

const claims = (over: Record<string, unknown> = {}) =>
  parseVerifiedClaims({
    sub: "99000000-0000-4000-8000-000000000001",
    email: "staff@example.invalid",
    aal: "aal1",
    app_roles: ["editor"],
    ...over,
  });

describe("parseVerifiedClaims", () => {
  it("extracts sub, roles and aal from a hook-shaped claims object", () => {
    const c = claims({ app_roles: ["publisher", "editor"], aal: "aal2" });
    expect(c).toMatchObject({ appRoles: ["publisher", "editor"], aal: "aal2" });
  });

  it("fails closed on garbage: unknown roles are dropped, missing app_roles → []", () => {
    expect(claims({ app_roles: ["publisher", "not_a_role"] })?.appRoles).toEqual(["publisher"]);
    expect(claims({ app_roles: undefined })?.appRoles).toEqual([]);
    expect(claims({ app_roles: "publisher" })?.appRoles).toEqual([]);
  });

  it("returns null for a claims object without a subject", () => {
    expect(parseVerifiedClaims({ aal: "aal1" })).toBeNull();
    expect(parseVerifiedClaims(null)).toBeNull();
  });
});

describe("assertRole", () => {
  it("throws unauthenticated when there is no session at all", () => {
    expect(() => assertRole(null, ["editor"])).toThrowError(
      expect.objectContaining({ reason: "unauthenticated" }) as Error,
    );
  });

  it("throws forbidden when none of the required roles is held", () => {
    expect(() => assertRole(claims(), ["publisher", "super_admin"])).toThrowError(
      expect.objectContaining({ reason: "forbidden" }) as Error,
    );
  });

  it("REJECTS a privileged action without aal2 — the CP2 exit criterion", () => {
    expect(() =>
      assertRole(claims({ app_roles: ["publisher"], aal: "aal1" }), ["publisher"], {
        aal2: true,
      }),
    ).toThrowError(expect.objectContaining({ reason: "aal2_required" }) as Error);
  });

  it("passes with the right role at aal2", () => {
    const c = claims({ app_roles: ["publisher"], aal: "aal2" });
    expect(assertRole(c, ["publisher"], { aal2: true })).toBe(c);
  });

  it("without the aal2 option, aal1 is acceptable (reads, non-privileged paths)", () => {
    const c = claims({ app_roles: ["language_reviewer_ja"], aal: "aal1" });
    expect(assertRole(c, ["language_reviewer_ja"])).toBe(c);
  });

  it("role match is ANY-of, and extra roles do not hurt", () => {
    const c = claims({ app_roles: ["editor", "publisher"], aal: "aal2" });
    expect(assertRole(c, ["super_admin", "publisher"], { aal2: true })).toBe(c);
  });

  it("AuthzError carries distinct reasons so handlers can render 401 vs 403 vs step-up", () => {
    expect(new AuthzError("aal2_required").reason).toBe("aal2_required");
  });
});
