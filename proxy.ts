import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { parseVerifiedClaims } from "@/lib/auth/claims";
import { env } from "@/config/env";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/locales";

/**
 * Proxy (Next 16 middleware). Two concerns, branched by pathname BEFORE any work:
 *
 *  1. /admin* — the staff routing guard (CONVENIENCE only; the real boundary is
 *     requireRole() in every handler + RLS/guarded fns, ADR-001). Unchanged from CP3.
 *  2. Public surface (CP4) — EN is served at the root (D3): `/en/*` → 308 to the
 *     de-prefixed path; `/ja` (and `/ko` later) pass through to the [locale] tree; every
 *     other path is EN content rewritten into `/en/*`. NO Supabase call on this branch —
 *     public pages are anonymous, and running getClaims here would 302 every visitor to
 *     /login.
 *
 * /login and /login/mfa are excluded from the matcher entirely (served directly), so this
 * guard can never wrap sign-in.
 */

const PREFIXED_LOCALES = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

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

export default async function proxy(request: NextRequest): Promise<NextResponse> {
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

  // 2b. `/ja` (and `/ko` post-Slice-2) → pass through to the [locale] tree; the layout's
  //     served-locale guard + dynamicParams=false 404 any locale not yet served.
  for (const locale of PREFIXED_LOCALES) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return NextResponse.next();
    }
  }

  // 2c. Everything else is EN content at the root → rewrite into `/en/*`.
  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
  return NextResponse.rewrite(url);
}

// Admin is NOT excluded (its guard must keep running); login IS excluded (served directly
// so it is never wrapped); api/_next/static/dotted-files are excluded from locale handling.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|login|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\..*).*)"],
};
