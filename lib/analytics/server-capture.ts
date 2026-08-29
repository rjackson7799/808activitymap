import { env } from "@/config/env";
import { captureError } from "@/lib/observability/log";
import { SESSION_FORWARD_HEADER } from "./session";

/**
 * Server-side capture transport (CP5, ADR-005). The proxy schedules these via
 * the request's waitUntil() AFTER the response is flushed, so capture adds zero
 * critical-path latency (the LCP budget is untouched). It posts to the Node
 * /api/events route with the internal token — the proxy itself never touches
 * Supabase or the service-role key. Edge-safe (fetch + env only).
 *
 * The destination is a validated deployment-owned origin from configuration,
 * never request metadata. Redirects are rejected so the internal token cannot
 * be forwarded to a second origin. A delivery failure is analytics loss,
 * logged but never surfaced.
 */
export async function postServerEvent(
  event: { name: "listing_view" | "session_start"; slug?: string; locale: string; sessionId: string },
  forwarded: { userAgent: string | null; referer: string | null; landingQuery: string | null },
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-events-internal": env().EVENTS_INTERNAL_TOKEN,
    [SESSION_FORWARD_HEADER]: event.sessionId,
  };
  if (forwarded.userAgent) headers["x-events-ua"] = forwarded.userAgent;
  if (forwarded.referer) headers["x-events-referer"] = forwarded.referer;
  if (forwarded.landingQuery) headers["x-events-query"] = forwarded.landingQuery;

  try {
    await fetch(new URL("/api/events", env().EVENTS_INGEST_ORIGIN), {
      method: "POST",
      headers,
      body: JSON.stringify({ name: event.name, slug: event.slug, locale: event.locale }),
      redirect: "error",
    });
  } catch (error) {
    captureError(error, { where: "proxy.postServerEvent", name: event.name });
  }
}
