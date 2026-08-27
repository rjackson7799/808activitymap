import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";

/**
 * Admin dashboard. Self-guards (the layout also guards — defense in depth;
 * neither is the boundary: server actions + RLS + guarded fns are, ADR-001).
 * The shell (nav, sign-out, <main> landmark) lives in the admin layout.
 */
export default async function AdminPage() {
  let claims;
  try {
    claims = await requireRole(STAFF_ROLES, { aal2: true });
  } catch (e) {
    if (e instanceof AuthzError) {
      redirect(e.reason === "aal2_required" ? "/login/mfa" : "/login");
    }
    throw e;
  }

  return (
    <>
      <h1>Admin</h1>
      <p>
        Signed in as <strong>{claims.email ?? claims.sub}</strong> — roles:{" "}
        <code>{claims.appRoles.join(", ") || "(none)"}</code> — session assurance:{" "}
        <code>{claims.aal}</code>
      </p>
      <ul>
        <li>
          <Link href="/admin/taxonomy">Taxonomy</Link> — categories &amp; per-locale labels
        </li>
        <li>
          <Link href="/admin/listings">Listings</Link> — publish, unpublish &amp; QA transitions
        </li>
      </ul>
    </>
  );
}
