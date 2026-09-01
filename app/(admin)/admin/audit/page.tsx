import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import {
  changedAuditFields,
  formatAuditSnapshot,
  formatAuditTimestamp,
  humanizeAuditValue,
  type AuditSnapshot,
} from "@/lib/audit/presentation";

type AuditRow = {
  id: number;
  actor: string | null;
  actor_source: "jwt" | "service" | "system";
  action: string;
  target_table: string;
  target_id: string | null;
  before: AuditSnapshot;
  after: AuditSnapshot;
  request_id: string | null;
  at: string;
};

const FULL_AUDIT_ROLES = ["super_admin", "publisher"] as const;

export default async function AuditPage() {
  let claims;
  try {
    claims = await requireRole(STAFF_ROLES, { aal2: true });
  } catch (error) {
    if (error instanceof AuthzError) redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw error;
  }

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("audit_log")
    .select("id,actor,actor_source,action,target_table,target_id,before,after,request_id,at")
    .order("at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as AuditRow[];
  const hasFullScope = claims.appRoles.some((role) => FULL_AUDIT_ROLES.includes(role as (typeof FULL_AUDIT_ROLES)[number]));
  const targetCount = new Set(rows.map((row) => row.target_table)).size;
  const actorCount = new Set(rows.map((row) => row.actor).filter(Boolean)).size;

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Governance</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Audit log</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Review the immutable history of staff and system changes. Newest events appear first.
        </p>
      </header>

      {!error ? (
        <section aria-label="Audit summary" className="grid gap-3 sm:grid-cols-3">
          <AuditMetric label="Events shown" value={rows.length} />
          <AuditMetric label="Data areas touched" value={targetCount} />
          <AuditMetric label="Identified actors" value={actorCount} />
        </section>
      ) : null}

      <section aria-labelledby="access-scope-heading" className="rounded-card border border-info/15 bg-info-bg p-5 sm:p-6">
        <h2 id="access-scope-heading" className="text-sm font-bold uppercase tracking-[0.12em] text-info">
          {hasFullScope ? "Full audit scope" : "Personal audit scope"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-secondary">
          {hasFullScope
            ? "Your role can review audit activity across the staff workspace."
            : "Your role can review only events attributed to your signed-in account."}
          {" "}Snapshots are read-only and cannot be edited or deleted here.
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">
          Couldn&apos;t load the audit log: {error.message}
        </p>
      ) : null}

      {!error && rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-bold text-ink">No audit activity in your scope</h2>
          <p className="mt-2 text-sm text-secondary">Recorded changes will appear here automatically.</p>
        </div>
      ) : null}

      {!error && rows.length > 0 ? (
        <section aria-labelledby="audit-events-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="audit-events-heading" className="text-xl font-bold text-ink">Recent events</h2>
              <p className="mt-1 text-sm text-secondary">Showing up to 100 events available to your role.</p>
            </div>
            <Badge variant="neutral">Read only</Badge>
          </div>

          <ol className="grid gap-4">
            {rows.map((row) => (
              <AuditEvent key={row.id} row={row} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function AuditMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-hairline-strong bg-white p-5 shadow-card">
      <p className="text-sm font-medium text-secondary">{label}</p>
      <p className="mt-2 font-serif text-3xl text-ink">{value}</p>
    </div>
  );
}

function AuditEvent({ row }: { row: AuditRow }) {
  const fields = changedAuditFields(row.before, row.after);

  return (
    <li>
      <article className="overflow-hidden rounded-card border border-hairline-strong bg-white shadow-card">
        <header className="border-b border-hairline bg-neutral/45 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={actionVariant(row.action)}>{humanizeAuditValue(row.action)}</Badge>
                <h3 className="break-all text-base font-bold text-ink">{humanizeAuditValue(row.target_table)}</h3>
              </div>
              <p className="mt-2 text-xs font-medium text-muted">
                <time dateTime={row.at}>{formatAuditTimestamp(row.at)} HST</time> · Event #{row.id}
              </p>
            </div>
            <Badge variant="neutral">{humanizeAuditValue(row.actor_source)}</Badge>
          </div>
        </header>

        <div className="p-5 sm:p-6">
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <AuditDetail label="Target ID" value={row.target_id ?? "Not recorded"} />
            <AuditDetail label="Actor" value={row.actor ?? "System"} />
            <AuditDetail label="Request ID" value={row.request_id ?? "Not recorded"} />
            <AuditDetail
              label="Changed fields"
              value={fields.length > 0 ? fields.map(humanizeAuditValue).join(", ") : "No field-level difference recorded"}
            />
          </dl>

          <details className="mt-6 rounded-field border border-hairline-strong bg-shell open:bg-white">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-teal-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal/30">
              View before and after snapshots
            </summary>
            <div className="grid gap-4 border-t border-hairline p-4 lg:grid-cols-2">
              <AuditSnapshotBlock label="Before" value={formatAuditSnapshot(row.before)} />
              <AuditSnapshotBlock label="After" value={formatAuditSnapshot(row.after)} />
            </div>
          </details>
        </div>
      </article>
    </li>
  );
}

function AuditDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-1.5 break-all text-sm leading-6 text-ink">{value}</dd>
    </div>
  );
}

function AuditSnapshotBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <h4 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{label}</h4>
      <pre className="mt-2 max-h-80 overflow-auto rounded-field bg-ink p-4 text-xs leading-5 text-white">{value}</pre>
    </div>
  );
}

function actionVariant(action: string): "verified" | "info" | "neutral" | "error" {
  if (action === "INSERT") return "verified";
  if (action === "UPDATE") return "info";
  if (action === "DELETE") return "error";
  return "neutral";
}
