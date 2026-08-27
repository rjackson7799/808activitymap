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
 * Fire-and-forget: a delivery failure is analytics loss, logged but never
 * surfaced. The route applies the bot/prefetch filter + canonical-slug
 * resolution, so non-canonical / bot / ineligible hits still drop server-side.
 */
export async function postServerEvent(
  origin: string,
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
    await fetch(`${origin}/api/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: event.name, slug: event.slug, locale: event.locale }),
    });
  } catch (error) {
    captureError(error, { where: "proxy.postServerEvent", name: event.name });
  }
}
