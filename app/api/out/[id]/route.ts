import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CONSENT_CLASS, isValidSessionId, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/analytics/session";
import { recordEvent } from "@/lib/analytics/ingest-db";
import { isBot } from "@/lib/analytics/filter";
import { resolveAffiliateClickout } from "@/lib/affiliate/server";
import { validateAffiliateDestination } from "@/lib/affiliate/url";
import { getAppConfig } from "@/lib/public-read/server";
import { captureError } from "@/lib/observability/log";

export const runtime = "nodejs";

const querySchema = z.object({ locale: z.enum(["en", "ja", "ko"]).default("en") });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const link = await resolveAffiliateClickout(id, parsed.data.locale);
  if (!link) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const destination = validateAffiliateDestination(link.destinationUrl);
  if (!destination.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = isValidSessionId(existing) ? existing : crypto.randomUUID();
  try {
    const config = await getAppConfig();
    if (!isBot(request.headers.get("user-agent"), config.bot_filter)) {
      await recordEvent({
        name: "affiliate_clickout",
        source: "server",
        props: { partner: link.partnerKey, context: link.context },
        sessionId,
        locale: parsed.data.locale,
        listingId: link.listingId,
        slug: null,
        referrerClass: null,
        consentClass: CONSENT_CLASS,
      });
    }
  } catch (error) {
    captureError(error, { where: "affiliate_clickout.analytics" });
  }

  const response = NextResponse.redirect(destination.url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
