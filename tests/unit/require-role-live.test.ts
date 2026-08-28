import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getClaims: mocks.getClaims },
    rpc: mocks.rpc,
  })),
}));

import { requireRole } from "@/lib/auth/require-role";

const claims = {
  sub: "99000000-0000-4000-8000-000000000001",
  aal: "aal2",
  app_roles: ["publisher"],
};

describe("requireRole live authorization", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.rpc.mockReset();
    mocks.getClaims.mockResolvedValue({ data: { claims }, error: null });
  });

  it("accepts a claimed role only when the live role and session check succeeds", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(requireRole(["publisher"], { aal2: true })).resolves.toMatchObject({
      sub: claims.sub,
      appRoles: ["publisher"],
      aal: "aal2",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("is_platform", {
      required: ["publisher"],
    });
  });

  it("rejects a captured JWT after its live role or session is revoked", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    await expect(requireRole(["publisher"], { aal2: true })).rejects.toMatchObject({
      reason: "forbidden",
    });
  });

  it("fails closed when the live authorization lookup errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });

    await expect(requireRole(["publisher"])).rejects.toMatchObject({
      reason: "forbidden",
    });
  });

  it("does not query live state for a JWT that lacks a required role", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { ...claims, app_roles: ["editor"] } },
      error: null,
    });

    await expect(requireRole(["publisher"])).rejects.toMatchObject({
      reason: "forbidden",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
