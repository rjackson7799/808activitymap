import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

/**
 * Server-side Supabase clients (ADR-001).
 *  - createSupabaseServerClient: cookie-bound, per-request — auth flows and
 *    RLS-scoped queries on behalf of the signed-in staff user.
 *  - createSupabaseServiceClient: service-role key, NO cookies — server-only
 *    read model / jobs. Bypasses RLS; never expose to request-derived input
 *    without an explicit authorization check first.
 */

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(env().NEXT_PUBLIC_SUPABASE_URL, env().NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies — the proxy refreshes
          // sessions; safe to ignore here.
        }
      },
    },
  });
}

export function createSupabaseServiceClient() {
  return createClient(env().NEXT_PUBLIC_SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
