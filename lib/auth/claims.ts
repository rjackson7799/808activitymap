import { ROLES, type Role } from "@/db/rls/matrix";

/**
 * Pure claims handling for requireRole (ADR-001). Works only on VERIFIED
 * claims — callers obtain them via supabase.auth.getClaims(), which checks
 * the JWT signature (falling back to a getUser() round-trip on symmetric
 * keys). Never feed this getSession() output: that is an unverified local
 * cookie parse.
 */

export interface VerifiedClaims {
  sub: string;
  email?: string;
  /** Platform roles injected by the access-token hook (migration 17). */
  appRoles: Role[];
  /** GoTrue authenticator assurance level; aal2 ⇔ MFA-verified session. */
  aal: "aal1" | "aal2";
}

export type AuthzReason = "unauthenticated" | "forbidden" | "aal2_required";

export class AuthzError extends Error {
  constructor(public readonly reason: AuthzReason) {
    super(`authz: ${reason}`);
    this.name = "AuthzError";
  }
}

const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (ROLES as readonly string[]).includes(value);

/** Fail-closed extraction: unknown roles dropped, malformed shapes → []. */
export function parseVerifiedClaims(claims: unknown): VerifiedClaims | null {
  if (claims === null || typeof claims !== "object") return null;
  const c = claims as Record<string, unknown>;
  if (typeof c.sub !== "string" || c.sub === "") return null;
  return {
    sub: c.sub,
    email: typeof c.email === "string" ? c.email : undefined,
    appRoles: Array.isArray(c.app_roles) ? c.app_roles.filter(isRole) : [],
    aal: c.aal === "aal2" ? "aal2" : "aal1",
  };
}

/**
 * The pure authorization core. Throws AuthzError with a distinct reason so
 * handlers can distinguish 401 / 403 / MFA step-up. Returns the claims for
 * ergonomic chaining.
 */
export function assertRole(
  claims: VerifiedClaims | null,
  roles: readonly Role[],
  opts: { aal2?: boolean } = {},
): VerifiedClaims {
  if (claims === null) throw new AuthzError("unauthenticated");
  if (!claims.appRoles.some((r) => roles.includes(r))) throw new AuthzError("forbidden");
  if (opts.aal2 && claims.aal !== "aal2") throw new AuthzError("aal2_required");
  return claims;
}

/** All live platform staff roles (Slice-1 availability). */
export const STAFF_ROLES: readonly Role[] = [
  "super_admin",
  "publisher",
  "editor",
  "language_reviewer_ja",
  "language_reviewer_ko",
  "ops_agent",
];
