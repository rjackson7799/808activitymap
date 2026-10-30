import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AuthzError } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { ASSISTED_UPDATE_STAFF_ROLES } from "@/lib/assisted-updates/admin";
import { AssistedResponseForm, AssistedUpdateIntake } from "./AssistedUpdateForms";

type AssistedMessageRow = {
  id: string;
  channel: "email" | "sms";
  locale: "en" | "ja";
  from_address: string;
  body: string;
  received_at: string;
  response_due_at: string;
  responded_at: string | null;
  response_note: string | null;
  linked_change_request_id: string;
  listings: { listing_locales: Array<{ locale: string; name: string | null }> } | null;
  change_requests: { status: string; diff: { field?: string; details?: string } } | null;
};

type ListingRow = { id: string; listing_locales: Array<{ locale: string; name: string | null }> };

export default async function AssistedUpdatesPage() {
  try {
    await requireRole(ASSISTED_UPDATE_STAFF_ROLES, { aal2: true });
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.reason === "forbidden") redirect("/admin");
      redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login");
    }
    throw error;
  }

  const db = await createSupabaseServerClient();
  const [messageResult, listingResult] = await Promise.all([
    db.from("assisted_messages")
      .select("id,channel,locale,from_address,body,received_at,response_due_at,responded_at,response_note,linked_change_request_id,listings(listing_locales(locale,name)),change_requests(status,diff)")
      .order("responded_at", { ascending: true, nullsFirst: true })
      .order("response_due_at", { ascending: true }),
    db.from("listings")
      .select("id,listing_locales(locale,name)")
      .order("created_at", { ascending: true }),
  ]);

  const rows = (messageResult.data ?? []) as unknown as AssistedMessageRow[];
  const listings = ((listingResult.data ?? []) as unknown as ListingRow[]).map((listing) => ({
    id: listing.id,
    name: listing.listing_locales.find((locale) => locale.locale === "en")?.name
      ?? listing.listing_locales.find((locale) => locale.name)?.name
      ?? listing.id,
  }));
  const now = Date.now();
  const awaiting = rows.filter((row) => !row.responded_at);
  const overdue = awaiting.filter((row) => new Date(row.response_due_at).getTime() < now);

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Assisted service</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Email &amp; SMS updates</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Retain vendor messages as restricted evidence, create an editorial correction, and track the one-business-day response target.
        </p>
      </header>

      <section aria-labelledby="record-update-heading">
        <div className="mb-4">
          <h2 id="record-update-heading" className="text-xl font-bold text-ink">Record an inbound update</h2>
          <p className="mt-1 text-sm text-secondary">Manual intake only. Nothing is published or sent automatically.</p>
        </div>
        {listingResult.error ? <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">Couldn&apos;t load listings.</p> : <AssistedUpdateIntake listings={listings} defaultReceivedAt={hawaiiDateTimeInput()} />}
      </section>

      {!messageResult.error && rows.length > 0 ? (
        <section aria-label="Assisted update summary" className="grid gap-3 sm:grid-cols-3">
          <QueueMetric label="Awaiting response" value={awaiting.length} />
          <QueueMetric label="Past response target" value={overdue.length} alert={overdue.length > 0} />
          <QueueMetric label="Total messages" value={rows.length} />
        </section>
      ) : null}

      {messageResult.error ? <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">Couldn&apos;t load assisted updates.</p> : null}

      {!messageResult.error && rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-bold text-ink">No assisted updates recorded</h2>
          <p className="mt-2 text-sm text-secondary">Inbound vendor email and SMS requests will appear here after staff records them.</p>
        </div>
      ) : null}

      {!messageResult.error && rows.length > 0 ? (
        <section aria-labelledby="assisted-queue-heading">
          <div className="mb-4">
            <h2 id="assisted-queue-heading" className="text-xl font-bold text-ink">Response queue</h2>
            <p className="mt-1 text-sm text-secondary">Unanswered messages appear first, ordered by response target.</p>
          </div>
          <div className="grid gap-5">
            {rows.map((row) => {
              const isOverdue = !row.responded_at && new Date(row.response_due_at).getTime() < now;
              const listingName = row.listings?.listing_locales.find((locale) => locale.locale === "en")?.name
                ?? row.listings?.listing_locales.find((locale) => locale.name)?.name
                ?? "Listing";
              return (
                <article id={`message-${row.id}`} key={row.id} className={`scroll-mt-6 overflow-hidden rounded-card border bg-white shadow-card ${isOverdue ? "border-error/40" : "border-hairline-strong"}`}>
                  <div className="border-b border-hairline bg-neutral/45 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-ink">{listingName}</h3>
                        <p className="mt-1 text-sm text-secondary">{row.channel.toUpperCase()} · {row.locale === "ja" ? "Japanese" : "English"} · {row.from_address}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={row.responded_at ? "verified" : "info"}>{row.responded_at ? "Responded" : "Awaiting response"}</Badge>
                        {isOverdue ? <Badge variant="error">Past target</Badge> : null}
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-medium text-muted">Received <time dateTime={row.received_at}>{formatDateTime(row.received_at)}</time> · Response target <time dateTime={row.response_due_at}>{formatDateTime(row.response_due_at)}</time></p>
                  </div>
                  <div className="grid gap-6 p-5 sm:p-6">
                    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                      <Detail label="Original message" value={row.body} wide />
                      <Detail label="Requested field" value={humanize(row.change_requests?.diff.field ?? "Unknown")} />
                      <Detail label="Correction status" value={humanize(row.change_requests?.status ?? "Unknown")} />
                      <Detail label="Correction summary" value={row.change_requests?.diff.details ?? "No summary available"} wide />
                      {row.response_note ? <Detail label="Response record" value={`${row.response_note}\n${formatDateTime(row.responded_at!)}`} wide /> : null}
                    </dl>
                    <Link href={`/admin/change-requests#request-${row.linked_change_request_id}`} className="w-fit text-sm font-bold text-teal-dark underline underline-offset-4">Open linked correction</Link>
                    {!row.responded_at ? <div className="border-t border-hairline pt-6"><AssistedResponseForm messageId={row.id} /></div> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QueueMetric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return <div className={`rounded-card border bg-white p-5 shadow-card ${alert ? "border-error/30" : "border-hairline-strong"}`}><p className="text-sm font-medium text-secondary">{label}</p><p className={`mt-2 font-serif text-3xl ${alert ? "text-error" : "text-ink"}`}>{value}</p></div>;
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : undefined}><dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{label}</dt><dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{value}</dd></div>;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Pacific/Honolulu" }).format(new Date(value));
}

function hawaiiDateTimeInput() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Honolulu", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
