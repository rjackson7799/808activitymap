import { z } from "zod";

/**
 * Environment schema — validated once at startup (TSD "Version pinning &
 * environment hygiene"; slice-1 fail-closed rule).
 *
 * Fail-closed contract: in production every security-critical key must be
 * present — there are NO code defaults. Dev/test defaults exist only outside
 * production, so a misconfigured prod deploy throws at boot instead of
 * silently running with dev credentials.
 */

const APP_ENVS = ["local", "test", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Keys that never get a default in production. */
const baseSchema = z.object({
  APP_ENV: z.enum(APP_ENVS),
  // Brand/domain are env-only by decision D27 — no brand string constants.
  BRAND_NAME: z.string().min(1),
  PORTAL_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
});

export type Env = z.infer<typeof baseSchema>;

const DEV_DEFAULTS: Partial<Record<keyof Env, string>> = {
  APP_ENV: "local",
  BRAND_NAME: "Portal (dev)",
  PORTAL_DOMAIN: "localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54331",
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54332/postgres",
  // Deliberately NO defaults for keys/secrets even in dev:
  // NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
};

/**
 * Parse an environment map. Pure — callers pass `process.env`; tests pass
 * fixtures. Production applies no defaults at all (fail-closed).
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const isProd = raw.APP_ENV === "production";
  const source: Record<string, string | undefined> = { ...raw };
  if (!isProd) {
    for (const [key, value] of Object.entries(DEV_DEFAULTS)) {
      source[key] ??= value;
    }
  }
  const result = baseSchema.safeParse(source);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => i.path.join("."))
      .join(", ");
    throw new Error(
      `Environment validation failed (APP_ENV=${raw.APP_ENV ?? "unset"}): ${missing}`,
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** App entry point — validated once, then cached. Server-only. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
