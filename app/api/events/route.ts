import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { isLocale } from "@/lib/locales";
import { getAppConfig } from "@/lib/public-read/server";
import { captureError } from "@/lib/observability/log";
import { parseEventInput, type EventSource } from "@/lib/analytics/events";
import { isBot, isPrefetch } from "@/lib/analytics/filter";
import { classifyReferrer } from "@/lib/analytics/referrer";
import { clientIpFromHeaders, hashIp } from "@/lib/analytics/ip";
import { rateLimitHit, recordEvent } from "@/lib/analytics/ingest-db";
import { CONSENT_CLASS, SESSION_COOKIE, SESSION_FORWARD_HEADER } from "@/lib/analytics/session";

/**
 * First-party analytics ingestion (CP5, TSD §8). POST only, Node runtime
 * (the service-role RPCs never touch the edge/proxy). Excluded from the locale
 * proxy by the matcher (`/api` is not rewritten).
 *
 * Pipeline: server-vs-client (internal token) → bot/prefetch drop → dictionary
 * validation → (client only) IP-hash + two-dimension rate limit → stamp
 * session/locale/referrer/consent → record_event. Analytics never breaks the
 * page: unknown/invalid input is a silent 204 drop; only a real rate-limit
 * over-cap returns 429. PostHog forwarding stays OFF (D19).
 */

export const runtime = "nodejs";

const NO_CONTENT = new NextResponse(null, { status: 204 });

const uuidSchema = z.uuid();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Trust boundary: a matching internal token marks a server-origin call
    //    (from the proxy's after() capture) — trusted source + rate-limit-exempt.
    const isServer = request.headers.get("x-events-internal") === env().EVENTS_INTERNAL_TOKEN;
    const source: EventSource = isServer ? "server" : "client";

    // For server events the proxy forwards the visitor's UA/referer/IP via
    // explicit x-events-* headers; for client beacons they arrive naturally.
    const userAgent = isServer
      ? request.headers.get("x-events-ua")
      : request.headers.get("user-agent");
    const referer = isServer
      ? request.headers.get("x-events-referer")
      : request.headers.get("referer");

    const config = await getAppConfig();

    // 2. Silent drops: bots (UA denylist incl. "lighthouse"/"headless") and
    //    speculative prefetch/preload hits never become events.
    if (isPrefetch(request.headers) || isBot(userAgent, config.bot_filter)) {
      return NO_CONTENT;
    }

    // 3. Dictionary validation (name implemented + source allowed + props).
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    let event;
    try {
      event = parseEventInput(body, { source });
    } catch {
      return NO_CONTENT; // don't leak the schema to abusers
    }

    // Envelope fields (outside the dictionary props): locale, target, session.
    const raw = body ?? {};
    const locale = typeof raw.locale === "string" && isLocale(raw.locale) ? raw.locale : null;
    const listingId =
      typeof raw.listing_id === "string" && uuidSchema.safeParse(raw.listing_id).success
        ? raw.listing_id
        : null;
    const slug = isServer && typeof raw.slug === "string" ? raw.slug : null;
    // Client session = the httpOnly sid cookie (untamperable); server session =
    // the value the trusted proxy forwards.
    const sessionId = isServer
      ? request.headers.get(SESSION_FORWARD_HEADER)
      : (request.cookies.get(SESSION_COOKIE)?.value ?? null);

    // 4. Rate limiting — client only, two dimensions (per-IP AND per-session).
    //    Fail-open: a limiter error never blocks ingestion.
    if (!isServer) {
      const { window_minutes, events_per_ip, events_per_session } = config.rate_limits;
      const windowSeconds = window_minutes * 60;
      const rawIp = clientIpFromHeaders(request.headers);

      if (rawIp) {
        const ipHit = await rateLimitHit(
          "events:ip",
          hashIp(rawIp, env().IP_HASH_PEPPER),
          events_per_ip,
          windowSeconds,
        );
        if (ipHit && !ipHit.allowed) return tooMany(ipHit.retry_after);
      }
      if (sessionId) {
        const sessionHit = await rateLimitHit(
          "events:session",
          sessionId,
          events_per_session,
          windowSeconds,
        );
        if (sessionHit && !sessionHit.allowed) return tooMany(sessionHit.retry_after);
      }
    }

    // 5. Referrer class is meaningful only on the server entry events, where the
    //    proxy forwards the real navigation Referer.
    const referrerClass = isServer
      ? classifyReferrer(config.referrer_classification, { referer, userAgent })
      : null;

    // 6. Insert (fail-safe — errors are logged and swallowed).
    await recordEvent({
      name: event.name,
      source,
      props: event.props,
      sessionId,
      locale,
      listingId,
      slug,
      referrerClass,
      consentClass: CONSENT_CLASS,
    });

    return NO_CONTENT;
  } catch (error) {
    // Any unexpected failure: log, but never surface (analytics is best-effort).
    captureError(error, { where: "POST /api/events" });
    return NO_CONTENT;
  }
}

function tooMany(retryAfterSeconds: number): NextResponse {
  return new NextResponse(null, {
    status: 429,
    headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) },
  });
}
