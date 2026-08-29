import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { correctionRequestSchema } from "@/lib/corrections/schema";
import { submitCorrection } from "@/lib/corrections/server";
import { getAppConfig } from "@/lib/public-read/server";
import { isBot, isPrefetch } from "@/lib/analytics/filter";
import { clientIpFromHeaders, hashIp } from "@/lib/analytics/ip";
import { rateLimitHit, recordEvent } from "@/lib/analytics/ingest-db";
import { CONSENT_CLASS, isValidSessionId, SESSION_COOKIE } from "@/lib/analytics/session";
import { captureError } from "@/lib/observability/log";

export const runtime = "nodejs";

function json(code: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, code }, { status, headers });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const origin = request.headers.get("origin");
    const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (origin) {
      let originHost: string | null = null;
      try { originHost = new URL(origin).host; } catch { /* rejected below */ }
      if (!requestHost || originHost !== requestHost) return json("invalid_origin", 403);
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return json("invalid_request", 415);
    }

    const config = await getAppConfig();
    if (isPrefetch(request.headers) || isBot(request.headers.get("user-agent"), config.bot_filter)) {
      return new NextResponse(null, { status: 204 });
    }

    const parsed = correctionRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json("invalid_request", 400);
    if (parsed.data.website) return new NextResponse(null, { status: 204 });

    const { window_minutes } = config.rate_limits;
    const { per_ip, per_session } = config.correction_rate_limits;
    const windowSeconds = window_minutes * 60;
    const rawIp = clientIpFromHeaders(request.headers);
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value ?? null;
    const hits = [];
    if (rawIp) {
      hits.push(await rateLimitHit(
        "corrections:ip",
        hashIp(rawIp, env().IP_HASH_PEPPER),
        per_ip,
        windowSeconds,
      ));
    }
    if (isValidSessionId(sessionId)) {
      hits.push(await rateLimitHit(
        "corrections:session",
        sessionId,
        per_session,
        windowSeconds,
      ));
    }
    if (hits.some((hit) => hit === null)) return json("temporarily_unavailable", 503);
    const blocked = hits.find((hit) => hit && !hit.allowed);
    if (blocked) {
      return json("rate_limited", 429, { "Retry-After": String(Math.max(1, blocked.retry_after)) });
    }

    const result = await submitCorrection(
      parsed.data,
      config.queue_sla_targets_hours.corrections,
    );
    if (!result.ok) {
      return json(result.reason, result.reason === "listing_not_found" ? 404 : 503);
    }

    await recordEvent({
      name: "report_change",
      source: "server",
      props: {},
      sessionId: isValidSessionId(sessionId) ? sessionId : null,
      locale: parsed.data.locale,
      listingId: parsed.data.listingId,
      slug: null,
      referrerClass: null,
      consentClass: CONSENT_CLASS,
    });

    return NextResponse.json({ ok: true, reference: result.id.slice(0, 8) }, { status: 201 });
  } catch (error) {
    captureError(error, { where: "POST /api/change-requests" });
    return json("temporarily_unavailable", 503);
  }
}
