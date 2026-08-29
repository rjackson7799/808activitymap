import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { parseVerifiedClaims } from "@/lib/auth/claims";
import { env } from "@/config/env";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/locales";
import { postServerEvent } from "@/lib/analytics/server-capture";
import { isValidSessionId, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/analytics/session";
import { decodeSlug, hasMalformedPercentEncoding } from "@/lib/public-read/paths";

/**
 * Proxy (Next 16 middleware). Three concerns, branched by pathname BEFORE any work:
 *
 *  1. /admin* — the staff routing guard (CONVENIENCE only; the real boundary is
 *     requireRole() in every handler + RLS/guarded fns, ADR-001). Unchanged from CP3.
 *  2. Public surface (CP4) — EN is served at the root (D3): `/en/*` → 308 to the
 *     de-prefixed path; `/ja` (and `/ko` later) pass through to the [locale] tree; every
 *     other path is EN content rewritten into `/en/*`. NO Supabase call on this branch —
 *     public pages are anonymous, and running getClaims here would 302 every visitor to
 *     /login.
 *  3. Analytics server capture (CP5, ADR-005) — on a public LISTING page load, mint the
 *     first-party `sid` cookie and schedule `listing_view` (+ `session_start` on a new
 *     session) via waitUntil AFTER the response flushes (zero critical-path latency,
 *     LCP-safe). Still no Supabase here: it fires a fire-and-forget internal fetch to
 *     the Node /api/events route (which owns bot/prefetch filtering + slug resolution).
 *     Prefetch/RSC/non-document requests are skipped so the count stays authoritative.
 */

const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);
const LISTING_PATH = /^\/spot\/([^/]+)\/?$/;
const RAW_LISTING_PATH = /^\/(?:(?:ja|ko)\/)?spot\/([^/]+)\/?$/;

/**
 * Validate the encoded segment from the untouched request URL. Next may throw
 * while decoding a malformed dynamic segment before the route component (and
 * before a normalized `nextUrl.pathname` guard) can return not-found.
 */
function hasMalformedListingEncoding(rawUrl: string): boolean {
  let rawPath: string;
  try {
    rawPath = new URL(rawUrl).pathname;
  } catch {
    return false;
  }
  const match = rawPath.match(RAW_LISTING_PATH);
  if (!match) return false;
  return hasMalformedPercentEncoding(match[1]!);
}

async function adminGuard(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : parseVerifiedClaims(data?.claims ?? null);

  if (claims === null) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (claims.aal !== "aal2") {
    return NextResponse.redirect(new URL("/login/mfa", request.url));
  }
  return response;
}

/**
 * A real, countable page view: a full HTML document load. Prefetches, RSC
 * client-navigations, and non-document requests are excluded — counting them
 * would inflate the authoritative server count (ADR-005).
 */
function isDocumentNavigation(request: NextRequest): boolean {
  const h = request.headers;
  if (h.get("next-router-prefetch") === "1") return false;
  if (h.get("purpose") === "prefetch") return false;
  const secPurpose = h.get("sec-purpose");
  if (secPurpose && secPurpose.includes("prefetch")) return false;
  if (h.get("rsc") === "1") return false; // client-side RSC navigation, not a document load
  return (h.get("accept") ?? "").includes("text/html");
}

/**
 * If this is a listing document load, mint/refresh the sid cookie on `response`
 * and schedule the server capture. Mutates `response` (Set-Cookie); returns it.
 */
function capturePublicAnalytics(
  request: NextRequest,
  event: NextFetchEvent,
  response: NextResponse,
  locale: Locale,
  localPath: string,
): NextResponse {
  if (!isDocumentNavigation(request)) return response;

  const match = localPath.match(LISTING_PATH);
  if (match) {
    if (hasMalformedPercentEncoding(match[1]!)) {
      // Next's dynamic-route decoder throws on malformed percent sequences.
      // Reject them at the boundary as an ordinary not-found response rather
      // than allowing an invalid public URL to become a server error.
      return new NextResponse(null, { status: 404 });
    }
  }
  const slug = match ? decodeSlug(match[1]!) : null;
  const existing = request.cookies.get(SESSION_COOKIE)?.value;
  const isNewSession = !isValidSessionId(existing);
  const sessionId = isNewSession ? crypto.randomUUID() : existing;

  // Sliding 30-min session window (refresh on each capture).
  response.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const forwarded = {
    userAgent: request.headers.get("user-agent"),
    referer: request.headers.get("referer"),
    landingQuery: request.nextUrl.search || null,
  };
  event.waitUntil(
    (async () => {
      if (isNewSession) {
        await postServerEvent({ name: "session_start", locale, sessionId }, forwarded);
      }
      if (slug) {
        await postServerEvent({ name: "listing_view", slug, locale, sessionId }, forwarded);
      }
    })(),
  );
  return response;
}

export default async function proxy(request: NextRequest, event: NextFetchEvent): Promise<NextResponse> {
  if (hasMalformedListingEncoding(request.url)) {
    return new NextResponse(null, { status: 404 });
  }
  const { pathname } = request.nextUrl;

  // 1. Admin surface — existing auth guard.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return adminGuard(request);
  }

  // 2a. `/en` or `/en/*` → 308 to the de-prefixed public path, preserving query.
  const enMatch = pathname.match(/^\/en(\/.*)?$/);
  if (enMatch) {
    const url = request.nextUrl.clone();
    url.pathname = enMatch[1] ?? "/";
    return NextResponse.redirect(url, 308);
  }

  // 2b. `/ja` (and `/ko` post-Slice-2) → pass through to the [locale] tree.
  for (const locale of PREFIXED_LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      const response = NextResponse.next();
      return capturePublicAnalytics(request, event, response, locale, pathname.slice(`/${locale}`.length));
    }
  }

  // 2c. Everything else is EN content at the root → rewrite into `/en/*`.
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
  const response = NextResponse.rewrite(url);
  return capturePublicAnalytics(request, event, response, DEFAULT_LOCALE, pathname);
}

// Admin is NOT excluded (its guard must keep running); login IS excluded (served directly
// so it is never wrapped); api/_next/static/dotted-files are excluded from locale handling.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|login|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\..*).*)"],
};
