import "server-only";
import { createSupabaseServiceClient } from "@/lib/auth/server";
import { captureError } from "@/lib/observability/log";
import type { EventSource } from "./events";

/**
 * The DB side of ingestion (CP5). Wraps the two service_role-only RPCs
 * (`rate_limit_hit`, `record_event`) with the ingestion failure policy:
 *  - rate limiting FAILS OPEN (site availability > analytics strictness): an
 *    RPC error is logged and treated as "allowed".
 *  - the event insert is FAIL-SAFE: a failure is logged and swallowed —
 *    analytics loss must never break the request.
 * Both RPCs are service_role-only (the anon key is public), so this module is
 * server-only and holds a single memoized service client.
 */

let cachedClient: ReturnType<typeof createSupabaseServiceClient> | undefined;
function db() {
  return (cachedClient ??= createSupabaseServiceClient());
}

export interface RateLimitResult {
  allowed: boolean;
  hit_count: number;
  retry_after: number;
}

/** One fixed-window increment. Returns null on RPC failure (caller fails open). */
export async function rateLimitHit(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult | null> {
  try {
    const { data, error } = await db().rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_subject: subject,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as RateLimitResult | undefined) ?? null;
  } catch (error) {
    captureError(error, { where: "rate_limit_hit", bucket });
    return null; // fail-open
  }
}

export interface RecordEventInput {
  name: string;
  source: EventSource;
  props: Record<string, unknown>;
  sessionId: string | null;
  locale: string | null;
  listingId: string | null;
  slug: string | null;
  referrerClass: string | null;
  consentClass: string | null;
}

/** Insert via the record_event RPC. Returns the event id, or null if dropped/failed. */
export async function recordEvent(input: RecordEventInput): Promise<string | null> {
  try {
    const { data, error } = await db().rpc("record_event", {
      p_name: input.name,
      p_source: input.source,
      p_props: input.props,
      p_session_id: input.sessionId,
      p_locale: input.locale,
      p_listing_id: input.listingId,
      p_slug: input.slug,
      p_referrer_class: input.referrerClass,
      p_consent_class: input.consentClass,
    });
    if (error) throw error;
    return (data as string | null) ?? null;
  } catch (error) {
    captureError(error, { where: "record_event", name: input.name });
    return null; // fail-safe: analytics loss never breaks the request
  }
}
