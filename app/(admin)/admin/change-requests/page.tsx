import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { ReviewControls } from "./ReviewControls";

type QueueRow = {
  id: string;
  target_id: string;
  base_version: number;
  diff: { field?: string; details?: string };
  reporter_name: string | null;
  reporter_email: string | null;
  status: string;
  assignee: string | null;
  sla_due_at: string;
  created_at: string;
  resolution_note: string | null;
  listings: { version: number; listing_locales: Array<{ locale: string; name: string | null }> } | null;
};

export default async function ChangeRequestsPage() {
  try {
    await requireRole(STAFF_ROLES, { aal2: true });
  } catch (error) {
    if (error instanceof AuthzError) redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw error;
  }

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("change_requests")
    .select("id,target_id,base_version,diff,reporter_name,reporter_email,status,assignee,sla_due_at,created_at,resolution_note,listings(version,listing_locales(locale,name))")
    .order("status", { ascending: true })
    .order("sla_due_at", { ascending: true });
  const rows = (data ?? []) as unknown as QueueRow[];
  // Queue age is intentionally evaluated at request time on this dynamic admin page.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const openCount = rows.filter((row) => row.status === "open").length;
  const overdueCount = rows.filter(
    (row) => row.status === "open" && new Date(row.sla_due_at).getTime() < now,
  ).length;

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Editorial review</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Correction requests</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Review community-submitted updates and keep listing information accurate.
        </p>
      </header>

      {!error && rows.length > 0 ? (
        <section aria-label="Queue summary" className="grid gap-3 sm:grid-cols-3">
          <QueueMetric label="Open requests" value={openCount} />
          <QueueMetric label="Past 48-hour target" value={overdueCount} alert={overdueCount > 0} />
          <QueueMetric label="Total requests" value={rows.length} />
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">
          Couldn&apos;t load corrections: {error.message}
        </p>
      ) : null}

      {!error && rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-bold text-ink">No correction requests yet</h2>
          <p className="mt-2 text-sm text-secondary">New community submissions will appear here for review.</p>
        </div>
      ) : null}

      {!error && rows.length > 0 ? (
        <section aria-labelledby="correction-queue-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="correction-queue-heading" className="text-xl font-bold text-ink">Review queue</h2>
              <p className="mt-1 text-sm text-secondary">Oldest open items appear first. Review target: 48 hours.</p>
            </div>
            <Badge variant="neutral">Editorial team</Badge>
          </div>

          <div className="grid gap-5">
            {rows.map((row) => {
              const ageHours = Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 3_600_000));
              const overdue = row.status === "open" && new Date(row.sla_due_at).getTime() < now;
              const names = row.listings?.listing_locales.filter((locale) => locale.name) ?? [];
              const title = names[0]?.name || row.target_id;

              return (
                <article
                  key={row.id}
                  className={`overflow-hidden rounded-card border bg-white shadow-card ${overdue ? "border-error/40" : "border-hairline-strong"}`}
                >
                  <div className="border-b border-hairline bg-neutral/45 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-lg font-bold text-ink">{title}</h3>
                        {names.length > 0 ? (
                          <p className="mt-1 text-sm text-secondary">
                            {names.map((name) => `${name.locale.toUpperCase()}: ${name.name}`).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Badge variant={statusVariant(row.status)}>{humanize(row.status)}</Badge>
                        {overdue ? <Badge variant="error">Past review target</Badge> : null}
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-medium text-muted">
                      Submitted <time dateTime={row.created_at}>{formatAge(ageHours)}</time>
                      {row.status === "open" ? <> · Due <time dateTime={row.sla_due_at}>{formatDate(row.sla_due_at)}</time></> : null}
                    </p>
                  </div>

                  <div className="p-5 sm:p-6">
                    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                      <Detail label="Field" value={humanize(row.diff.field || "Not specified")} />
                      <Detail label="Version at submission / current" value={`${row.base_version} / ${row.listings?.version ?? "Unknown"}`} />
                      <Detail label="Reported change" value={row.diff.details || "No details supplied"} wide />
                      <Detail label="Reporter" value={[row.reporter_name, row.reporter_email].filter(Boolean).join(" · ") || "Anonymous"} />
                      <Detail label="Assignee" value={row.assignee ?? "Unassigned"} />
                    </dl>

                    <div className="mt-6 border-t border-hairline pt-6">
                      {row.status === "open" ? (
                        <ReviewControls requestId={row.id} />
                      ) : (
                        <div className={`rounded-field border p-4 ${resolutionClassName(row.status)}`}>
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-secondary">Resolution</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">
                            {row.resolution_note || "No resolution note recorded."}
                          </p>
                        </div>
                      )}
                    </div>
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
  return (
    <div className={`rounded-card border bg-white p-5 shadow-card ${alert ? "border-error/30" : "border-hairline-strong"}`}>
      <p className="text-sm font-medium text-secondary">{label}</p>
      <p className={`mt-2 font-serif text-3xl ${alert ? "text-error" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-1.5 break-words whitespace-pre-wrap text-sm leading-6 text-ink">{value}</dd>
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusVariant(status: string): "verified" | "info" | "neutral" | "error" {
  if (status === "merged") return "verified";
  if (status === "open") return "info";
  if (status === "rejected") return "error";
  return "neutral";
}

function resolutionClassName(status: string) {
  if (status === "merged") return "border-success/15 bg-success-bg";
  if (status === "rejected") return "border-error/15 bg-error-bg";
  return "border-hairline-strong bg-neutral";
}

function formatAge(hours: number) {
  if (hours < 1) return "less than an hour ago";
  if (hours === 1) return "1 hour ago";
  if (hours < 48) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Pacific/Honolulu",
  }).format(new Date(value));
}
