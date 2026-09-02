import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { APP_CONFIG_REGISTRY } from "@/config/app-config";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import {
  approvalAgeDays,
  canRecordExternalMenuApproval,
  hasApprovalIntegrityIssue,
  isPendingMenuApproval,
  nextReminderDay,
  summarizeMenuApprovals,
  type MenuApprovalQueueItem,
} from "@/lib/menu-approvals/admin";
import { fetchMenuApprovalQueue } from "@/lib/menu-approvals/read";
import { ApprovalControls } from "./ApprovalControls";

export default async function ApprovalsPage() {
  let claims;
  try {
    claims = await requireRole(STAFF_ROLES, { aal2: true });
  } catch (error) {
    if (error instanceof AuthzError) redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw error;
  }

  const supabase = await createSupabaseServerClient();
  const [{ items, evidence, error }, reminderResult] = await Promise.all([
    fetchMenuApprovalQueue(supabase),
    supabase.from("app_config").select("value").eq("key", "menu_approval_reminder_days").maybeSingle(),
  ]);
  const reminderParsed = APP_CONFIG_REGISTRY.menu_approval_reminder_days.schema.safeParse(reminderResult.data?.value);
  const reminderDays = reminderParsed.success
    ? reminderParsed.data
    : APP_CONFIG_REGISTRY.menu_approval_reminder_days.devDefault;
  const canRecord = canRecordExternalMenuApproval(claims.appRoles);
  const summary = summarizeMenuApprovals(items);
  // Queue age is intentionally evaluated at request time on this dynamic staff page.
  const now = new Date();

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Vendor sign-off</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Menu approvals</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Track written vendor approval for each localized menu before publication. This records an existing signed document; it does not contact the vendor or publish the menu.
        </p>
      </header>

      {!error && items.length > 0 ? (
        <section aria-label="Approval queue summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QueueMetric label="Awaiting approval" value={summary.pending} alert={summary.pending > 0} />
          <QueueMetric label="Approval recorded" value={summary.recorded} />
          <QueueMetric label="Published menus" value={summary.published} />
          <QueueMetric label="Integrity alerts" value={summary.integrityIssues} alert={summary.integrityIssues > 0} />
        </section>
      ) : null}

      <div className={`rounded-field border p-4 text-sm leading-6 ${canRecord ? "border-success/15 bg-success-bg text-success" : "border-hairline-strong bg-neutral text-secondary"}`}>
        <p className="font-bold">{canRecord ? "External-approval recording enabled" : "Read-only approval tracking"}</p>
        <p className="mt-1">
          {canRecord
            ? "The database will verify the evidence type, source rights, role, two-factor session, and workflow transition before accepting a record."
            : "Your role can inspect the queue but cannot record vendor approval."}
        </p>
      </div>

      {error || reminderResult.error ? (
        <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">
          Couldn&apos;t load menu approvals: {error?.message ?? reminderResult.error?.message}
        </p>
      ) : null}

      {!error && !reminderResult.error && items.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline-strong bg-white p-8 text-center shadow-card">
          <h2 className="text-lg font-bold text-ink">No menu locales yet</h2>
          <p className="mt-2 text-sm text-secondary">Menu locales will appear here after they enter the content workflow.</p>
        </div>
      ) : null}

      {!error && !reminderResult.error && items.length > 0 ? (
        <section aria-labelledby="approval-queue-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="approval-queue-heading" className="text-xl font-bold text-ink">Approval queue</h2>
              <p className="mt-1 text-sm text-secondary">
                Pending items are oldest first. Reminder cadence: days {reminderDays.join(", ")}.
              </p>
            </div>
            <Badge variant="neutral">Phase 0 · external evidence</Badge>
          </div>

          <div className="grid gap-5">
            {items.map((item) => (
              <ApprovalCard
                key={item.id}
                item={item}
                evidence={evidence}
                canRecord={canRecord}
                reminderDays={reminderDays}
                now={now}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ApprovalCard({
  item,
  evidence,
  canRecord,
  reminderDays,
  now,
}: {
  item: MenuApprovalQueueItem;
  evidence: Array<{ id: string; path: string }>;
  canRecord: boolean;
  reminderDays: number[];
  now: Date;
}) {
  const pending = isPendingMenuApproval(item);
  const integrityIssue = hasApprovalIntegrityIssue(item);
  const ageDays = approvalAgeDays(item, now);
  const nextReminder = nextReminderDay(ageDays, reminderDays);

  return (
    <article className={`overflow-hidden rounded-card border bg-white shadow-card ${integrityIssue ? "border-error/40" : pending ? "border-warning/30" : "border-hairline-strong"}`}>
      <div className="border-b border-hairline bg-neutral/45 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-lg font-bold text-ink">{item.listingName}</h3>
            <p className="mt-1 text-sm text-secondary">{localeName(item.locale)} · Menu version {item.menuVersion}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant={statusVariant(item.status)}>{humanize(item.status)}</Badge>
            {integrityIssue ? <Badge variant="error">Evidence integrity alert</Badge> : null}
          </div>
        </div>
        {pending ? (
          <p className="mt-3 text-xs font-medium text-muted">
            Waiting {ageDays === 0 ? "less than one day" : `${ageDays} ${ageDays === 1 ? "day" : "days"}`}
            {nextReminder ? ` · Next reminder day ${nextReminder}` : " · Final reminder threshold reached"}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
        <dl className="grid content-start gap-x-8 gap-y-5 sm:grid-cols-2">
          <Detail label="Approval method" value={item.approvalType ? humanize(item.approvalType) : "Not recorded"} />
          <Detail label="Approved at" value={item.approvedAt ? formatDateTime(item.approvedAt) : "Not recorded"} />
          <Detail label="Evidence document" value={item.evidencePath ?? "Not attached"} wide />
          <Detail label="Approver ID" value={item.approvedBy ?? "Not recorded"} wide />
        </dl>
        <div className="mt-5">
          <Link href={`/admin/listings/${item.listingId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open listing publication review
          </Link>
        </div>

        <div className="border-t border-hairline pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          {pending && canRecord ? (
            <ApprovalControls listingId={item.listingId} menuLocaleId={item.id} locale={item.locale} evidence={evidence} />
          ) : pending ? (
            <p className="rounded-field bg-neutral p-4 text-sm leading-6 text-secondary">An editor, operations agent, publisher, or super-admin must record the signed approval.</p>
          ) : (
            <p className={`rounded-field border p-4 text-sm leading-6 ${integrityIssue ? "border-error/15 bg-error-bg text-error" : "border-success/15 bg-success-bg text-success"}`}>
              {integrityIssue ? "This record needs super-admin investigation before further publication changes." : "The external approval record is complete and immutable audit history is retained."}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function QueueMetric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return <div className={`rounded-card border bg-white p-5 shadow-card ${alert ? "border-warning/30" : "border-hairline-strong"}`}><p className="text-sm font-medium text-secondary">{label}</p><p className={`mt-2 font-serif text-3xl ${alert ? "text-terracotta-deep" : "text-ink"}`}>{value}</p></div>;
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : undefined}><dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{label}</dt><dd className="mt-1.5 break-words text-sm leading-6 text-ink">{value}</dd></div>;
}

function statusVariant(status: string): "verified" | "info" | "stale" | "neutral" {
  if (["approved", "published"].includes(status)) return "verified";
  if (status === "qa_approved") return "info";
  if (status === "vendor_approval_pending") return "stale";
  return "neutral";
}

function humanize(value: string) {
  return value
    .split("_")
    .map((word) => word === "qa" ? "QA" : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function localeName(locale: string) {
  return { en: "English", ja: "Japanese", ko: "Korean" }[locale] ?? locale.toUpperCase();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Honolulu" }).format(new Date(value));
}
