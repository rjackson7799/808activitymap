import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { fetchListingPublishView } from "@/lib/publishing/read";
import { itemViewState } from "@/lib/view-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
      <div className="space-y-6">
        <Link href="/admin/listings" className={buttonVariants({ variant: "outline", size: "sm" })}>← Listings</Link>
        <h1 className="font-serif text-4xl text-ink">Publish</h1>
        <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">
          {state.notFound ? "That listing doesn't exist." : `Couldn't load the listing: ${state.message}`}
        </p>
      </div>
    );
  }

  const view = state.data;
  const displayName = view.locales.find((locale) => locale.locale === "en")?.name ?? view.locales.find((locale) => locale.name)?.name ?? "Untitled listing";

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin/listings" className={buttonVariants({ variant: "outline", size: "sm" })}>← Listings</Link>
        <p className="eyebrow mb-3 mt-6">Publishing review</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">{displayName}</h1>
            <p className="mt-3 text-sm text-secondary">Review live publication gates before changing public status.</p>
          </div>
          <Badge variant={view.publication_status === "published" ? "verified" : "neutral"} className="text-xs">
            <span data-testid="publication-status">{view.publication_status}</span>
          </Badge>
        </div>
      </header>

      <section aria-labelledby="listing-locales-heading">
        <div className="mb-4">
          <h2 id="listing-locales-heading" className="text-xl font-bold text-ink">Listing locales</h2>
          <p className="mt-1 text-sm text-secondary">Each locale must clear its live blockers before publishing.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
        {view.locales.map((ll) => (
          <article key={ll.locale} data-testid={`locale-${ll.locale}`} className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow mb-2">{localeName(ll.locale)}</p>
                <h3 className="text-lg font-bold text-ink" lang={ll.locale}>{ll.name ?? "No localized name"}</h3>
              </div>
              <Badge variant={statusVariant(ll.status)}><span data-testid={`status-${ll.locale}`}>{ll.status}</span></Badge>
            </div>
            {ll.blockers.length > 0 ? (
              <div className="mt-5 rounded-field border border-warning/15 bg-warning-bg p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-terracotta-deep">Publish blockers</p>
              <ul aria-label={`${ll.locale} publish blockers`} className="mt-2 list-disc space-y-1 pl-5 text-sm text-terracotta-deep">
                {ll.blockers.map((b, i) => (
                  <li key={`${b.blocker_code}-${i}`}>{humanize(b.blocker_code)}</li>
                ))}
              </ul>
              </div>
            ) : (
              <p className="mt-5 rounded-field bg-success-bg px-3 py-2.5 text-sm font-semibold text-success">Ready to publish.</p>
            )}
            <LocaleControls listingId={view.id} locale={ll.locale} status={ll.status} />
          </article>
        ))}
        </div>
      </section>

      <section aria-labelledby="menu-publishing-heading">
        <div className="mb-4">
          <h2 id="menu-publishing-heading" className="text-xl font-bold text-ink">Menu publishing</h2>
          <p className="mt-1 text-sm text-secondary">Record vendor evidence and publish approved menu locales.</p>
        </div>
        {view.menuLocales.length === 0 ? (
          <div className="rounded-card border border-dashed border-hairline-strong bg-white p-6 text-center text-sm text-secondary">No menu is attached to this listing.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
          {view.menuLocales.map((m) => (
            <article key={m.id} data-testid={`menu-${m.locale}`} className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow mb-2">{localeName(m.locale)}</p>
                  <h3 className="text-lg font-bold text-ink">Menu locale</h3>
                </div>
                <Badge variant={statusVariant(m.status)}><span data-testid={`menu-status-${m.locale}`}>{m.status}</span></Badge>
              </div>
              {m.approval_type ? <p className="mt-3 text-sm text-secondary">Approval: {humanize(m.approval_type)}</p> : null}
              <MenuApprovalControls
                listingId={view.id}
                mvlId={m.id}
                locale={m.locale}
                status={m.status}
                evidenceMedia={view.evidenceMedia}
              />
            </article>
          ))
          }</div>
        )}
      </section>
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function localeName(locale: string) {
  return { en: "English", ja: "Japanese", ko: "Korean" }[locale] ?? locale.toUpperCase();
}

function statusVariant(status: string): "verified" | "info" | "stale" | "neutral" {
  if (["published", "approved", "vendor_approved"].includes(status)) return "verified";
  if (["qa_approved", "qa_pending"].includes(status)) return "info";
  if (["machine_draft", "vendor_approval_pending"].includes(status)) return "stale";
  return "neutral";
}
