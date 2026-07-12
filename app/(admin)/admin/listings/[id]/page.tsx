import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { fetchListingPublishView } from "@/lib/publishing/read";
import { itemViewState } from "@/lib/view-state";
import { LocaleControls, MenuApprovalControls } from "./PublishControls";

/**
 * Publish surface (CP3): per-locale status + live publication-gate blockers +
 * publish/unpublish/QA controls, and the menu-approval (record external
 * vendor approval with evidence) + publish controls. Every mutation runs
 * through a guarded fn (PublishControls → server actions). Error / not-found
 * state via itemViewState.
 */
export default async function ListingPublishPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(STAFF_ROLES, { aal2: true });
  } catch (e) {
    if (e instanceof AuthzError) redirect(e.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw e;
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await fetchListingPublishView(supabase, id);
  const state = itemViewState(data, error);

  if (state.kind === "error") {
    return (
      <>
        <p><Link href="/admin/listings">← Listings</Link></p>
        <h1>Publish</h1>
        <p role="alert" style={{ color: "#b00020" }}>
          {state.notFound ? "That listing doesn't exist." : `Couldn't load the listing: ${state.message}`}
        </p>
      </>
    );
  }

  const view = state.data;

  return (
    <>
      <p><Link href="/admin/listings">← Listings</Link></p>
      <h1>Publish listing</h1>
      <p>
        Listing status: <strong data-testid="publication-status">{view.publication_status}</strong>
      </p>

      <section aria-label="Locales">
        <h2>Locales</h2>
        {view.locales.map((ll) => (
          <div key={ll.locale} data-testid={`locale-${ll.locale}`} style={{ borderTop: "1px solid #eee", padding: "0.6rem 0" }}>
            <p style={{ margin: 0 }}>
              <strong lang={ll.locale}>{ll.name ?? "(no name)"}</strong> — {ll.locale}:{" "}
              <span data-testid={`status-${ll.locale}`}>{ll.status}</span>
            </p>
            {ll.blockers.length > 0 ? (
              <ul aria-label={`${ll.locale} publish blockers`} style={{ margin: "0.2rem 0", color: "#92400e" }}>
                {ll.blockers.map((b, i) => (
                  <li key={`${b.blocker_code}-${i}`}>{b.blocker_code}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: "0.2rem 0", color: "#166534" }}>Ready to publish.</p>
            )}
            <LocaleControls listingId={view.id} locale={ll.locale} status={ll.status} />
          </div>
        ))}
      </section>

      <section aria-label="Menu" style={{ marginTop: "1.25rem" }}>
        <h2>Menu</h2>
        {view.menuLocales.length === 0 ? (
          <p>No menu for this listing.</p>
        ) : (
          view.menuLocales.map((m) => (
            <div key={m.id} data-testid={`menu-${m.locale}`} style={{ borderTop: "1px solid #eee", padding: "0.6rem 0" }}>
              <p style={{ margin: 0 }}>
                {m.locale}: <span data-testid={`menu-status-${m.locale}`}>{m.status}</span>
                {m.approval_type ? ` (${m.approval_type})` : ""}
              </p>
              <MenuApprovalControls
                listingId={view.id}
                mvlId={m.id}
                locale={m.locale}
                status={m.status}
                evidenceMedia={view.evidenceMedia}
              />
            </div>
          ))
        )}
      </section>
    </>
  );
}
