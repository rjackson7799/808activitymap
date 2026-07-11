import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { parseVerifiedClaims } from "@/lib/auth/claims";
import { env } from "@/config/env";

/**
 * /admin routing guard (Next 16 proxy — the artist formerly known as
 * middleware). A CONVENIENCE layer only: it bounces unauthenticated staff
 * to /login and aal1 sessions to the MFA step (TSD §6: no admin route
 * without aal2). The enforcement boundary is requireRole() in every
 * handler + RLS/guarded fns at the DB (ADR-001).
 */
export default async function proxy(request: NextRequest) {
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

export const config = {
  matcher: ["/admin/:path*"],
};
