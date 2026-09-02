import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { createSupabaseServiceClient } from "@/lib/auth/server";
import { getAppConfig } from "@/lib/public-read/server";
import { captureError, logEvent } from "@/lib/observability/log";

/**
 * Scheduled events maintenance (CP5). Vercel Cron invokes this with
 * `GET` + `Authorization: Bearer $CRON_SECRET` (production deployments only).
 * It: (1) extends the monthly events partitions, (2) alerts if the
 * `events_default` catch-all is ever non-empty (partition creation fell
 * behind — migration 14), (3) prunes first-party events past
 * `retention_days.events`, and (4) prunes hashed-IP/session rate-limit rows
 * past `retention_days.ip_abuse` (90d).
 *
 * Excluded from the locale proxy by the matcher (`/api` is not rewritten).
 * Uses the service client — the maintenance RPCs are service_role-only.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get("authorization") !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = createSupabaseServiceClient();

  try {
    const { data: created, error: partErr } = await db.rpc("ensure_events_partitions", {
      p_months_ahead: 3,
    });
    if (partErr) throw partErr;

    const { data: defaultCountRaw, error: countErr } = await db.rpc("events_default_count");
    if (countErr) throw countErr;
    const eventsDefaultCount = Number(defaultCountRaw ?? 0);
    if (eventsDefaultCount > 0) {
      logEvent("error", "events_default partition is non-empty — partition creation fell behind", {
        where: "cron/partitions",
        eventsDefaultCount,
      });
    }

    const { retention_days } = await getAppConfig();
    const { data: eventsPruned, error: eventPruneErr } = await db.rpc("prune_events", {
      p_retain_days: retention_days.events,
    });
    if (eventPruneErr) throw eventPruneErr;

    const { data: pruned, error: pruneErr } = await db.rpc("prune_rate_limits", {
      p_retain_days: retention_days.ip_abuse,
    });
    if (pruneErr) throw pruneErr;

    const { data: dealStatusRows, error: dealStatusError } = await db.rpc("reconcile_deal_statuses");
    if (dealStatusError) throw dealStatusError;
    const dealStatuses = Array.isArray(dealStatusRows) ? dealStatusRows[0] : dealStatusRows;

    return NextResponse.json({
      ok: true,
      partitionsCreated: created ?? 0,
      eventsDefaultCount,
      eventsPruned: eventsPruned ?? 0,
      rateLimitsPruned: pruned ?? 0,
      dealsActivated: dealStatuses?.activated ?? 0,
      dealsExpired: dealStatuses?.expired ?? 0,
    });
  } catch (error) {
    captureError(error, { where: "cron/partitions" });
    return NextResponse.json({ ok: false, error: "maintenance_failed" }, { status: 500 });
  }
}
