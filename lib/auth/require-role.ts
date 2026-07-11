import "server-only";
import type { Role } from "@/db/rls/matrix";
import {
  assertRole,
  parseVerifiedClaims,
  type VerifiedClaims,
} from "./claims";
import { createSupabaseServerClient } from "./server";

/**
 * THE handler-level authorization boundary (ADR-001). Every privileged
 * server action and route handler calls this — the proxy /admin guard is a
 * routing convenience, never the boundary; RLS + guarded fns back it at the
 * DB so MFA follows the actor to any path.
 *
 * Reads VERIFIED claims via supabase.auth.getClaims() (signature-checked;
 * getUser() round-trip fallback on symmetric signing keys). Throws
 * AuthzError(reason: unauthenticated | forbidden | aal2_required).
 */
export async function requireRole(
  roles: readonly Role[],
  opts: { aal2?: boolean } = {},
): Promise<VerifiedClaims> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : parseVerifiedClaims(data?.claims ?? null);
  return assertRole(claims, roles, opts);
}
