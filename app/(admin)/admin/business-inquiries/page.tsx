import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AuthzError } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { BUSINESS_INQUIRY_STAFF_ROLES } from "@/lib/business-inquiries/admin";
import { InquiryControls } from "./InquiryControls";

type InquiryStatus = "open" | "contacted" | "closed";

type InquiryRow = {
  id: string;
  source_locale: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  message: string;
  preferred_language: string;
  consent_at: string;
  consent_version: string;
  status: InquiryStatus;
  created_at: string;
  updated_at: string;
  handled_by: string | null;
  handled_at: string | null;
  staff_note: string | null;
};

export default async function BusinessInquiriesPage() {
  try {
    await requireRole(BUSINESS_INQUIRY_STAFF_ROLES, { aal2: true });
  } catch (error) {
    if (error instanceof AuthzError) {
      if (error.reason === "forbidden") redirect("/admin");
      redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login");
    }
    throw error;
  }

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("list_business_inquiries");
  const rows = (data ?? []) as InquiryRow[];
  const openCount = rows.filter((row) => row.status === "open").length;
  const contactedCount = rows.filter((row) => row.status === "contacted").length;

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Business outreach</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Business inquiries</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Follow up on expressions of interest from the public business page. An inquiry is not a claim, account, or publishing approval.
        </p>
      </header>

      {!error && rows.length > 0 ? (
        <section aria-label="Inquiry summary" className="grid gap-3 sm:grid-cols-3">
          <QueueMetric label="Awaiting contact" value={openCount} />
          <QueueMetric label="Contacted" value={contactedCount} />
          <QueueMetric label="Total inquiries" value={rows.length} />
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">
          Couldn&apos;t load business inquiries. Please try again.
        </p>
      ) : null}

      {!error && rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-bold text-ink">No business inquiries yet</h2>
          <p className="mt-2 text-sm text-secondary">New submissions from the business page will appear here.</p>
        </div>
      ) : null}

      {!error && rows.length > 0 ? (
        <section aria-labelledby="business-inquiry-queue-heading">
          <div className="mb-4">
            <h2 id="business-inquiry-queue-heading" className="text-xl font-bold text-ink">Outreach queue</h2>
            <p className="mt-1 text-sm text-secondary">Open inquiries appear first, oldest first. Contact details are restricted to operations staff.</p>
          </div>

          <div className="grid gap-5">
            {rows.map((row) => (
              <article key={row.id} className="overflow-hidden rounded-card border border-hairline-strong bg-white shadow-card">
                <div className="border-b border-hairline bg-neutral/45 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-bold text-ink">{row.business_name}</h3>
                      <p className="mt-1 text-sm text-secondary">Preferred language: {languageLabel(row.preferred_language)}</p>
                    </div>
                    <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                  </div>
                  <p className="mt-3 text-xs font-medium text-muted">
                    Received <time dateTime={row.created_at}>{formatDateTime(row.created_at)}</time> · Source {row.source_locale.toUpperCase()}
                  </p>
                </div>

                <div className="grid gap-6 p-5 sm:p-6">
                  <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                    <Detail label="Contact" value={row.contact_name} />
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Email</dt>
                      <dd className="mt-1.5 break-all text-sm leading-6"><a className="font-semibold text-teal-dark underline underline-offset-4" href={`mailto:${row.email}`}>{row.email}</a></dd>
                    </div>
                    {row.phone ? <div><dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Phone</dt><dd className="mt-1.5 text-sm leading-6"><a className="font-semibold text-teal-dark underline underline-offset-4" href={`tel:${row.phone}`}>{row.phone}</a></dd></div> : null}
                    {row.website ? <div><dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Website</dt><dd className="mt-1.5 break-all text-sm leading-6"><a className="font-semibold text-teal-dark underline underline-offset-4" href={row.website} target="_blank" rel="noreferrer">{row.website}</a></dd></div> : null}
                    <Detail label="Inquiry" value={row.message} wide />
                    <Detail label="Contact consent" value={`${formatDateTime(row.consent_at)} · ${row.consent_version}`} wide />
                    {row.staff_note ? <Detail label="Latest internal note" value={row.staff_note} wide /> : null}
                    {row.handled_at ? <Detail label="Last handled" value={`${formatDateTime(row.handled_at)} · staff ${shortId(row.handled_by)}`} wide /> : null}
                  </dl>

                  <div className="border-t border-hairline pt-6">
                    <InquiryControls inquiryId={row.id} currentStatus={row.status} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QueueMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-card border border-hairline-strong bg-white p-5 shadow-card"><p className="text-sm font-medium text-secondary">{label}</p><p className="mt-2 font-serif text-3xl text-ink">{value}</p></div>;
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : undefined}><dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{label}</dt><dd className="mt-1.5 break-words whitespace-pre-wrap text-sm leading-6 text-ink">{value}</dd></div>;
}

function statusVariant(status: InquiryStatus): "info" | "verified" | "neutral" {
  if (status === "open") return "info";
  if (status === "contacted") return "verified";
  return "neutral";
}

function statusLabel(status: InquiryStatus) {
  if (status === "open") return "Awaiting contact";
  if (status === "contacted") return "Contacted";
  return "Closed";
}

function languageLabel(locale: string) {
  return locale === "ja" ? "Japanese" : "English";
}

function shortId(value: string | null) {
  return value ? value.slice(0, 8) : "unknown";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Honolulu",
  }).format(new Date(value));
}
