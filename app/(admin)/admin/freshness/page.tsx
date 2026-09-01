import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, Database, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import {
  fetchFreshnessDashboard,
  type FreshnessFact,
  type ListingFreshness,
} from "@/lib/freshness/dashboard";

export default async function FreshnessPage() {
  try {
    await requireRole(STAFF_ROLES, { aal2: true });
  } catch (error) {
    if (error instanceof AuthzError) redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw error;
  }

  const db = await createSupabaseServerClient();
  const { data, error } = await fetchFreshnessDashboard(db);

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Content health</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Freshness</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Monitor approved provenance against the configured review windows. This workspace is read-only.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">
          Couldn&apos;t load freshness data: {error.message}
        </p>
      ) : null}

      {data ? (
        <>
          <section aria-label="Freshness summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Published listings" value={data.publishedListings} icon={<Database aria-hidden="true" />} />
            <Metric label="Current facts" value={data.currentFacts} icon={<CheckCircle2 aria-hidden="true" />} />
            <Metric
              label="Stale facts"
              value={data.staleFacts}
              tone={data.staleFacts > 0 ? "warning" : "default"}
              icon={<Clock3 aria-hidden="true" />}
            />
            <Metric
              label="Listings needing attention"
              value={data.listingsNeedingAttention}
              tone={data.listingsNeedingAttention > 0 ? "warning" : "default"}
              icon={<AlertTriangle aria-hidden="true" />}
            />
          </section>

          <section aria-labelledby="thresholds-heading" className="rounded-card border border-info/15 bg-info-bg p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-info" />
              <div className="min-w-0">
                <h2 id="thresholds-heading" className="text-sm font-bold uppercase tracking-[0.12em] text-info">
                  Configured review windows
                </h2>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  A fact becomes stale after its field-specific window or its explicit expiration date, whichever comes first.
                  Staleness flags content for review; it does not automatically unpublish a listing.
                </p>
                <dl className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(data.thresholds).map(([field, days]) => (
                    <div key={field} className="rounded-field border border-info/10 bg-white px-3 py-2 text-sm">
                      <dt className="inline font-semibold text-ink">{thresholdLabel(field)}</dt>{" "}
                      <dd className="inline text-secondary">{days} days</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>

          <section aria-labelledby="listing-freshness-heading">
            <div className="mb-4">
              <h2 id="listing-freshness-heading" className="text-xl font-bold text-ink">Listing health</h2>
              <p className="mt-1 text-sm text-secondary">Listings that need review appear first.</p>
            </div>

            {data.listings.length === 0 ? (
              <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card">
                <h3 className="text-lg font-bold text-ink">No listings yet</h3>
                <p className="mt-2 text-sm text-secondary">Freshness status will appear when listings are added.</p>
              </div>
            ) : (
              <ul className="grid gap-4">
                {data.listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-card border border-hairline-strong bg-white p-5 shadow-card">
      <div className={tone === "warning" ? "text-terracotta-deep" : "text-teal-dark"}>
        <span className="block h-5 w-5">{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-sm font-semibold text-secondary">{label}</p>
    </div>
  );
}

function ListingCard({ listing }: { listing: ListingFreshness }) {
  return (
    <li className="rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-ink">{listing.name}</h3>
          <p className="mt-1 text-sm text-secondary">{humanize(listing.publicationStatus)}</p>
        </div>
        {listing.needsAttention ? (
          <Badge variant="stale">Needs review</Badge>
        ) : (
          <Badge variant="verified">Current</Badge>
        )}
      </div>

      {listing.facts.length === 0 ? (
        <p className="mt-5 rounded-field bg-warning-bg p-4 text-sm leading-6 text-terracotta-deep">
          {listing.publicationStatus === "published"
            ? "This published listing has no current approved provenance."
            : "No current approved provenance has been recorded yet."}
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-hairline border-y border-hairline">
          {listing.facts.map((fact) => <FactRow key={`${fact.id}-${listing.id}`} fact={fact} />)}
        </ul>
      )}
    </li>
  );
}

function FactRow({ fact }: { fact: FreshnessFact }) {
  return (
    <li className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{factLabel(fact.field)}</p>
          <Badge variant="neutral">{targetLabel(fact.targetTable)}</Badge>
          {fact.affectsBadge ? <Badge variant="info">Badge fact</Badge> : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-secondary">
          Verified {formatDate(fact.verifiedAt)} · {humanize(fact.suppliedBy)}
          {fact.expiresAt ? ` · Expires ${formatDate(fact.expiresAt)}` : ""}
        </p>
      </div>
      <Badge variant={fact.isStale ? "stale" : "verified"}>{fact.isStale ? "Stale" : "Fresh"}</Badge>
    </li>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function factLabel(field: string) {
  const labels: Record<string, string> = {
    name: "Name",
    price_band: "Price band",
    attributes: "Attributes",
    address: "Address",
    phone: "Phone",
    geo: "Map location",
    hours: "Hours",
    operational_status: "Operating status",
    weekly: "Weekly hours",
    editorial_note: "Editorial note",
    rights: "Media rights",
    content: "Menu content",
  };
  return labels[field] ?? humanize(field);
}

function targetLabel(target: string) {
  const labels: Record<string, string> = {
    listings: "Listing",
    locations: "Location",
    hours_sets: "Hours",
    listing_locales: "Locale",
    media: "Media",
    menu_versions: "Menu",
  };
  return labels[target] ?? humanize(target);
}

function thresholdLabel(field: string) {
  const labels: Record<string, string> = {
    hours: "Hours",
    price: "Pricing",
    menu: "Menus",
    business_fact: "Business facts",
    editorial_note: "Editorial notes",
  };
  return labels[field] ?? humanize(field);
}
