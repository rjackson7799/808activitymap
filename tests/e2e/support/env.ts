/**
 * E2E environment resolution. `playwright.config.ts` loads .env.local via
 * @next/env before anything imports this, so local runs and CI (which sets the
 * vars from `supabase status`) both work. Service key + DB URL are used only by
 * setup/teardown/fixtures — never by the browser.
 */
export interface E2eEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  databaseUrl: string;
  baseUrl: string;
}

export function e2eEnv(): E2eEnv {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  const baseUrl = process.env.PORTAL_E2E_BASE_URL ?? "http://127.0.0.1:3100";

  const missing = Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    DATABASE_URL: databaseUrl,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`E2E env missing: ${missing.join(", ")} (source .env.local or supabase status)`);
  }

  return {
    supabaseUrl: supabaseUrl!,
    anonKey: anonKey!,
    serviceKey: serviceKey!,
    databaseUrl: databaseUrl!,
    baseUrl,
  };
}

/** Deterministic staff accounts for the journey (E2E-only). */
export const E2E_USERS = {
  publisher: {
    email: "e2e-superadmin@portal.invalid",
    password: "e2e-superadmin-pw-123456",
    role: "super_admin" as const,
  },
  editor: {
    email: "e2e-editor@portal.invalid",
    password: "e2e-editor-pw-123456",
    role: "editor" as const,
  },
  reviewerJa: {
    email: "e2e-reviewer-ja@portal.invalid",
    password: "e2e-reviewer-ja-pw-123456",
    role: "language_reviewer_ja" as const,
  },
};
