import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/config/env";
import { signOut } from "../login/actions";

/**
 * Admin shell (CP3). Wraps ONLY `/admin/*` — `/login` and `/login/mfa` are
 * siblings under the (admin) route group, not children of `admin/`, so this
 * guard cannot deadlock sign-in. NEVER move this to `app/(admin)/layout.tsx`:
 * that would wrap the login flow and self-lock staff out.
 *
 * The layout guard is redirect ergonomics; it is NOT the security boundary —
 * every page and every server action self-guards with requireRole, and RLS +
 * the guarded SECURITY DEFINER fns back it at the DB (ADR-001).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireRole(STAFF_ROLES, { aal2: true });
  } catch (e) {
    if (e instanceof AuthzError) {
      redirect(e.reason === "aal2_required" ? "/login/mfa" : "/login");
    }
    throw e;
  }

  const brand = env().BRAND_NAME;

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 880, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", borderBottom: "1px solid #ddd", paddingBottom: "0.75rem" }}>
        <nav aria-label="Admin" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <strong>{brand}</strong>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/taxonomy">Taxonomy</Link>
          <Link href="/admin/listings">Listings</Link>
          <Link href="/admin/change-requests">Corrections</Link>
        </nav>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </header>
      <main style={{ paddingTop: "1.25rem" }}>{children}</main>
    </div>
  );
}
