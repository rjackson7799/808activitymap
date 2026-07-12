import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAppConfig, type AppConfig } from "@/config/app-config";
import { env } from "@/config/env";
import { DEFAULT_LOCALE, type Locale } from "@/lib/locales";

/**
 * Server-only app_config loader (CP4). Fetches the rows via the service client (anon is
 * denied; service_role bypasses RLS) and validates them through the pure parseAppConfig.
 * The cached wrapper (Unit G) supplies the client; here it is injected so the loader is
 * testable without a request context.
 *
 * NOTE: the caller must NOT cache `public_surface_enabled` behind a tag that never busts
 * — it is the rollback kill switch (read it fresh or with a short cacheLife).
 */
export async function loadAppConfig(client: SupabaseClient): Promise<AppConfig> {
  const { data, error } = await client.from("app_config").select("key, value");
  if (error) throw new Error(`app_config load failed: ${error.message}`);
  const rows: Record<string, unknown> = {};
  for (const r of (data ?? []) as { key: string; value: unknown }[]) {
    rows[r.key] = r.value;
  }
  return parseAppConfig(rows, env().APP_ENV);
}

/** Publicly served locales for a market (locale_availability); defaults to EN only. */
export function publicLocalesFor(config: AppConfig, marketId: string): Locale[] {
  return config.locale_availability[marketId] ?? [DEFAULT_LOCALE];
}
