import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { fetchListings } from "@/lib/publishing/read";
import { listViewState } from "@/lib/view-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

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
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Publishing</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Listings</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Review locale readiness and manage what appears on the public discovery site.
        </p>
      </header>

      {state.kind === "error" ? (
        <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">Couldn&apos;t load listings: {state.message}</p>
      ) : null}
      {state.kind === "empty" ? (
        <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-bold text-ink">No listings yet</h2>
          <p className="mt-2 text-sm text-secondary">Listings will appear here when they are added to the catalog.</p>
        </div>
      ) : null}
      {state.kind === "ok" ? (
        <section aria-labelledby="listing-directory-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 id="listing-directory-heading" className="text-xl font-bold text-ink">Listing directory</h2>
              <p className="mt-1 text-sm text-secondary">Open a listing to review publication gates and menus.</p>
            </div>
            <Badge variant="neutral">{state.data.length} total</Badge>
          </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {state.data.map((l) => (
            <li key={l.id} className="flex min-h-52 flex-col rounded-card border border-hairline-strong bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="min-w-0 text-lg font-bold text-ink">{l.name ?? "Untitled listing"}</h3>
                <Badge variant={publicationVariant(l.publication_status)}>{humanize(l.publication_status)}</Badge>
              </div>
              <div aria-label="Locale statuses" className="mt-5 flex flex-wrap gap-2">
                {l.locales.map((ll) => (
                  <Badge key={ll.locale} variant={localeVariant(ll.status)}>
                    {ll.locale.toUpperCase()} · {humanize(ll.status)}
                  </Badge>
                ))}
                {l.locales.length === 0 ? <span className="text-sm text-muted">No locale records</span> : null}
              </div>
              <div className="mt-auto pt-6">
                <Link href={`/admin/listings/${l.id}`} className={buttonVariants({ variant: "primary", size: "md" })}>
                  Review publishing
                </Link>
              </div>
            </li>
          ))}
        </ul>
        </section>
      ) : null}
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function publicationVariant(status: string): "verified" | "stale" | "neutral" {
  if (status === "published") return "verified";
  if (status === "partially_published") return "stale";
  return "neutral";
}

function localeVariant(status: string): "verified" | "info" | "stale" | "neutral" {
  if (status === "published" || status === "vendor_approved") return "verified";
  if (status === "qa_approved" || status === "qa_pending") return "info";
  if (status === "machine_draft") return "stale";
  return "neutral";
}
