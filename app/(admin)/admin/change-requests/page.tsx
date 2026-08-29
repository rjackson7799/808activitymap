import { redirect } from "next/navigation";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { ReviewControls } from "./ReviewControls";

type QueueRow = {
  id: string; target_id: string; base_version: number; diff: { field?: string; details?: string };
  reporter_name: string | null; reporter_email: string | null; status: string; assignee: string | null;
  sla_due_at: string; created_at: string; resolution_note: string | null;
  listings: { version: number; listing_locales: Array<{ locale: string; name: string | null }> } | null;
};

export default async function ChangeRequestsPage() {
  try { await requireRole(STAFF_ROLES, { aal2: true }); }
  catch (error) { if (error instanceof AuthzError) redirect(error.reason === "aal2_required" ? "/login/mfa" : "/login"); throw error; }
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("change_requests")
    .select("id,target_id,base_version,diff,reporter_name,reporter_email,status,assignee,sla_due_at,created_at,resolution_note,listings(version,listing_locales(locale,name))")
    .order("status", { ascending: true }).order("sla_due_at", { ascending: true });
  const rows = (data ?? []) as unknown as QueueRow[];
  // Queue age is intentionally evaluated at request time on this dynamic admin page.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return <>
    <h1>Correction requests</h1>
    <p>Owner: editorial team · Review target: 48 hours · Oldest open items first.</p>
    {error ? <p role="alert" style={{ color: "#b00020" }}>Couldn&apos;t load corrections: {error.message}</p> : null}
    {!error && rows.length === 0 ? <p>No correction requests yet.</p> : null}
    <div style={{ display: "grid", gap: "1rem" }}>
      {rows.map((row) => {
        const ageHours = Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 3_600_000));
        const overdue = row.status === "open" && new Date(row.sla_due_at).getTime() < now;
        const names = row.listings?.listing_locales.filter((x) => x.name).map((x) => `${x.locale}: ${x.name}`).join(" · ") || row.target_id;
        return <article key={row.id} style={{ border: `1px solid ${overdue ? "#b00020" : "#ddd"}`, borderRadius: 8, padding: "1rem" }}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}><strong>{names}</strong><span>{row.status} · {ageHours}h old{overdue ? " · SLA overdue" : ""}</span></header>
          <dl><dt>Field</dt><dd>{row.diff.field}</dd><dt>Reported change</dt><dd style={{ whiteSpace: "pre-wrap" }}>{row.diff.details}</dd><dt>Base/current version</dt><dd>{row.base_version} / {row.listings?.version ?? "unknown"}</dd><dt>Reporter</dt><dd>{[row.reporter_name, row.reporter_email].filter(Boolean).join(" · ") || "Anonymous"}</dd><dt>Assignee</dt><dd>{row.assignee ?? "Unassigned"}</dd></dl>
          {row.status === "open" ? <ReviewControls requestId={row.id} /> : <p><strong>Resolution:</strong> {row.resolution_note}</p>}
        </article>;
      })}
    </div>
  </>;
}
