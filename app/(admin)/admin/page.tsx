import { redirect } from "next/navigation";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { signOut } from "../login/actions";

/**
 * Minimal protected admin landing (CP2). Proves the boundary stack:
 * proxy (routing convenience) → requireRole at the handler → RLS at the DB.
 * The real admin surface (taxonomy CRUD, publish queue) arrives in CP3.
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
    <main style={{ maxWidth: 560, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>Admin</h1>
      <p>
        Signed in as <strong>{claims.email ?? claims.sub}</strong> — roles:{" "}
        <code>{claims.appRoles.join(", ") || "(none)"}</code> — session assurance:{" "}
        <code>{claims.aal}</code>
      </p>
      <p>Slice 1 · CP2 security boundary. Taxonomy and publishing arrive with CP3.</p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
