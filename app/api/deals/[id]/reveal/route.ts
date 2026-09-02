import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { clientIpFromHeaders, hashIp } from "@/lib/analytics/ip";
import { rateLimitHit } from "@/lib/analytics/ingest-db";
import { isValidSessionId, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/analytics/session";
import { findActiveDealAlternatives, revealDeal } from "@/lib/deals/server";
import { getAppConfig } from "@/lib/public-read/server";

export const runtime = "nodejs";

const inputSchema = z.object({ locale: z.enum(["en", "ja", "ko"]) }).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  if (!isValidSessionId(sessionId)) return NextResponse.json({ error: "session_required" }, { status: 400 });

  const config = await getAppConfig();
  const windowSeconds = config.rate_limits.window_minutes * 60;
  const subjects: Array<[string, string]> = [["reveals:session", sessionId]];
  const rawIp = clientIpFromHeaders(request.headers);
  if (rawIp) subjects.push(["reveals:ip", hashIp(rawIp, env().IP_HASH_PEPPER)]);

  for (const [bucket, subject] of subjects) {
    const hit = await rateLimitHit(bucket, subject, config.rate_limits.reveals_per_ip, windowSeconds);
    if (!hit) return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
    if (!hit.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(Math.max(1, hit.retry_after)) } },
      );
    }
  }

  const result = await revealDeal(id, parsed.data.locale, sessionId);
  if (result.result === "expired") {
    const alternatives = config.deal_expiration_behavior.show_alternatives
      ? await findActiveDealAlternatives(parsed.data.locale, id, config.deal_expiration_behavior.alternatives_count)
      : [];
    return NextResponse.json({ error: "expired", alternatives }, { status: 410 });
  }
  if (result.result === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (result.result !== "ok") return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });

  const response = NextResponse.json({ code: result.code });
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
