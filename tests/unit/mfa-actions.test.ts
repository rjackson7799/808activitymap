import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  listFactors: vi.fn(),
  challenge: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  verify: vi.fn(),
  rpc: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getClaims: mocks.getClaims,
      mfa: {
        listFactors: mocks.listFactors,
        challenge: mocks.challenge,
        enroll: mocks.enroll,
        unenroll: mocks.unenroll,
        verify: mocks.verify,
      },
    },
  })),
  createSupabaseServiceClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));
vi.mock("@/lib/observability/log", () => ({ captureError: mocks.captureError }));

import { prepareMfa, verifyMfa } from "@/app/(admin)/login/mfa/actions";

const actor = "99000000-0000-4000-8000-000000000001";
const factorId = "99000000-0000-4000-8000-000000000011";
const challengeId = "99000000-0000-4000-8000-000000000021";

const factor = (status: "verified" | "unverified") => ({
  id: factorId,
  factor_type: "totp",
  status,
  friendly_name: "Authenticator",
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
});

describe("server-owned MFA lifecycle auditing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: actor, aal: "aal1", app_roles: ["editor"] } },
      error: null,
    });
    mocks.challenge.mockResolvedValue({ data: { id: challengeId }, error: null });
    mocks.enroll.mockResolvedValue({
      data: {
        id: factorId,
        type: "totp",
        friendly_name: "Authenticator",
        totp: { qr_code: "SECRET_QR", secret: "SECRET_MANUAL", uri: "SECRET_URI" },
      },
      error: null,
    });
    mocks.unenroll.mockResolvedValue({ data: {}, error: null });
    mocks.verify.mockResolvedValue({ data: {}, error: null });
    mocks.rpc.mockResolvedValue({ data: "trigger_recorded", error: null });
  });

  it("challenges an existing verified factor without a lifecycle audit", async () => {
    mocks.listFactors.mockResolvedValue({
      data: { all: [factor("verified")], totp: [factor("verified")] },
      error: null,
    });

    await expect(prepareMfa()).resolves.toEqual({
      kind: "challenge",
      factorId,
      challengeId,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("audits abandoned-factor deletion and fresh enrollment without exposing secrets", async () => {
    mocks.listFactors.mockResolvedValue({
      data: { all: [factor("unverified")], totp: [] },
      error: null,
    });

    await expect(prepareMfa()).resolves.toMatchObject({ kind: "enroll", factorId });
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls.map((call) => call[1].p_operation)).toEqual([
      "delete",
      "insert",
    ]);
    const serializedCalls = JSON.stringify(mocks.rpc.mock.calls);
    expect(serializedCalls).not.toContain("SECRET_QR");
    expect(serializedCalls).not.toContain("SECRET_MANUAL");
    expect(serializedCalls).not.toContain("SECRET_URI");
  });

  it("logs an audit failure but still returns successful enrollment", async () => {
    mocks.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
    mocks.rpc.mockResolvedValue({ data: "failed", error: null });

    await expect(prepareMfa()).resolves.toMatchObject({ kind: "enroll", factorId });
    expect(mocks.captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: "insert", factorId }),
    );
    expect(JSON.stringify(mocks.captureError.mock.calls)).not.toContain("SECRET_MANUAL");
  });

  it("bounds a stalled audit lookup without withholding enrollment", async () => {
    vi.useFakeTimers();
    try {
      mocks.listFactors.mockResolvedValue({ data: { all: [], totp: [] }, error: null });
      mocks.rpc.mockReturnValue(new Promise(() => {}));

      const pending = prepareMfa();
      await vi.advanceTimersByTimeAsync(1_500);
      await expect(pending).resolves.toMatchObject({ kind: "enroll", factorId });
      expect(mocks.captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ operation: "insert", factorId, timedOut: true }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not continue enrollment when abandoned-factor removal itself fails", async () => {
    mocks.listFactors.mockResolvedValue({
      data: { all: [factor("unverified")], totp: [] },
      error: null,
    });
    mocks.unenroll.mockResolvedValue({ data: null, error: { message: "remove failed" } });

    await expect(prepareMfa()).resolves.toEqual({ kind: "error", message: "remove failed" });
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("verifies initial enrollment and audits only the factor status transition", async () => {
    mocks.listFactors.mockResolvedValue({
      data: { all: [factor("unverified")], totp: [] },
      error: null,
    });

    await expect(
      verifyMfa({ kind: "enroll", factorId, code: "123456" }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.challenge).toHaveBeenCalledWith({ factorId });
    expect(mocks.verify).toHaveBeenCalledWith({ factorId, challengeId, code: "123456" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "ensure_mfa_factor_audit",
      expect.objectContaining({
        p_actor: actor,
        p_operation: "update",
        p_before_status: "unverified",
        p_after_status: "verified",
      }),
    );
  });

  it("does not audit a rejected code", async () => {
    mocks.listFactors.mockResolvedValue({
      data: { all: [factor("unverified")], totp: [] },
      error: null,
    });
    mocks.verify.mockResolvedValue({ data: null, error: { message: "bad code" } });

    await expect(
      verifyMfa({ kind: "enroll", factorId, code: "123456" }),
    ).resolves.toEqual({ ok: false, message: "Code not accepted — try the next code." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
