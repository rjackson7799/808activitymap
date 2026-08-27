import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { fetchListings } from "@/lib/publishing/read";
import { listViewState } from "@/lib/view-state";

/**
 * Listings index (CP3): every listing with its publication status and per-
 * locale status, linking to the publish surface. Distinct empty AND error
 * states (TSD P1-2). Staff read; publish actions are publisher+/aal2.
 */
export default async function ListingsPage() {
  try {
    await requireRole(STAFF_ROLES, { aal2: true });
  } catch (e) {
    if (e instanceof AuthzError) redirect(e.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw e;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await fetchListings(supabase);
  const state = listViewState(data, error);

  return (
    <>
      <h1>Listings</h1>
      {state.kind === "error" ? (
        <p role="alert" style={{ color: "#b00020" }}>Couldn&apos;t load listings: {state.message}</p>
      ) : null}
      {state.kind === "empty" ? <p>No listings yet.</p> : null}
      {state.kind === "ok" ? (
        <ul>
          {state.data.map((l) => (
            <li key={l.id} style={{ marginBottom: "0.4rem" }}>
              <Link href={`/admin/listings/${l.id}`}>{l.name ?? l.id}</Link>{" "}
              <span style={{ color: "#555" }}>[{l.publication_status}]</span>{" "}
              <span>
                {l.locales.map((ll) => (
                  <span key={ll.locale} style={{ marginRight: "0.4rem" }}>
                    {ll.locale}:{ll.status}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
