"use server";

import { z } from "zod";
import { parseVerifiedClaims } from "@/lib/auth/claims";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/auth/server";
import { captureError } from "@/lib/observability/log";

type FactorSnapshot = {
  id: string;
  factor_type: "totp";
  status: "unverified" | "verified";
  friendly_name?: string;
};

export type MfaPreparation =
  | { kind: "error"; message: string }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "challenge"; factorId: string; challengeId: string };

export type MfaVerification = { ok: true } | { ok: false; message: string };

const verifySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("enroll"),
    factorId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
  }),
  z.object({
    kind: z.literal("challenge"),
    factorId: z.string().uuid(),
    challengeId: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
  }),
]);

const AUDIT_TIMEOUT_MS = 1_500;

async function verifiedActor() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : parseVerifiedClaims(data?.claims ?? null);
  return claims ? { supabase, actor: claims.sub } : null;
}

async function verifyAuditBestEffort(
  actor: string,
  operation: "insert" | "update" | "delete",
  before: FactorSnapshot | null,
  after: FactorSnapshot | null,
): Promise<void> {
  const factor = after ?? before;
  if (!factor) return;

  try {
    const service = createSupabaseServiceClient();
    const rpc = service.rpc("ensure_mfa_factor_audit", {
      p_actor: actor,
      p_factor_id: factor.id,
      p_operation: operation,
      p_factor_type: factor.factor_type,
      p_friendly_name: factor.friendly_name ?? null,
      p_before_status: before?.status ?? null,
      p_after_status: after?.status ?? null,
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      rpc.then(({ data, error }) => ({ kind: "result" as const, data, error })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        timeoutId = setTimeout(() => resolve({ kind: "timeout" }), AUDIT_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timeoutId));

    if (
      outcome.kind === "timeout" ||
      outcome.error ||
      !["trigger_recorded", "fallback_recorded"].includes(String(outcome.data))
    ) {
      captureError(new Error("MFA audit verification failed"), {
        operation,
        factorId: factor.id,
        timedOut: outcome.kind === "timeout",
      });
    }
  } catch (error) {
    captureError(error, { operation, factorId: factor.id });
  }
}

const totpSnapshot = (factor: {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string;
}): FactorSnapshot => ({
  id: factor.id,
  factor_type: "totp",
  status: factor.status === "verified" ? "verified" : "unverified",
  friendly_name: factor.friendly_name,
});

export async function prepareMfa(): Promise<MfaPreparation> {
  const identity = await verifiedActor();
  if (!identity) return { kind: "error", message: "Sign in again to continue." };

  const { supabase, actor } = identity;
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { kind: "error", message: error.message };

  const verified = data.totp[0];
  if (verified) {
    const challenge = await supabase.auth.mfa.challenge({ factorId: verified.id });
    if (challenge.error) return { kind: "error", message: challenge.error.message };
    return {
      kind: "challenge",
      factorId: verified.id,
      challengeId: challenge.data.id,
    };
  }

  const abandoned = data.all.find(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified",
  );
  if (abandoned) {
    const removed = await supabase.auth.mfa.unenroll({ factorId: abandoned.id });
    if (removed.error) return { kind: "error", message: removed.error.message };
    await verifyAuditBestEffort(actor, "delete", totpSnapshot(abandoned), null);
  }

  const enroll = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (enroll.error) return { kind: "error", message: enroll.error.message };

  await verifyAuditBestEffort(actor, "insert", null, {
    id: enroll.data.id,
    factor_type: "totp",
    status: "unverified",
    friendly_name: enroll.data.friendly_name,
  });
  return {
    kind: "enroll",
    factorId: enroll.data.id,
    qr: enroll.data.totp.qr_code,
    secret: enroll.data.totp.secret,
  };
}

export async function verifyMfa(input: unknown): Promise<MfaVerification> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter a valid 6-digit code." };

  const identity = await verifiedActor();
  if (!identity) return { ok: false, message: "Sign in again to continue." };
  const { supabase, actor } = identity;
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) return { ok: false, message: factors.error.message };

  const factor = factors.data.all.find(
    (candidate) =>
      candidate.id === parsed.data.factorId && candidate.factor_type === "totp",
  );
  const expectedStatus = parsed.data.kind === "enroll" ? "unverified" : "verified";
  if (!factor || factor.status !== expectedStatus) {
    return { ok: false, message: "Authenticator state changed. Sign in again." };
  }

  let challengeId: string;
  if (parsed.data.kind === "enroll") {
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error) return { ok: false, message: challenge.error.message };
    challengeId = challenge.data.id;
  } else {
    challengeId = parsed.data.challengeId;
  }

  const verified = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId,
    code: parsed.data.code,
  });
  if (verified.error) {
    return { ok: false, message: "Code not accepted — try the next code." };
  }

  if (parsed.data.kind === "enroll") {
    const before = totpSnapshot(factor);
    await verifyAuditBestEffort(actor, "update", before, {
      ...before,
      status: "verified",
    });
  }
  return { ok: true };
}
