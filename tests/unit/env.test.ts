import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";

const FULL_PROD_ENV = {
  APP_ENV: "production",
  BRAND_NAME: "RealBrand",
  PORTAL_DOMAIN: "example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  DATABASE_URL: "postgresql://user:pass@host:5432/db",
  IP_HASH_PEPPER: "prod-pepper",
  EVENTS_INTERNAL_TOKEN: "prod-internal-token",
  CRON_SECRET: "prod-cron-secret",
};

describe("parseEnv — fail-closed contract", () => {
  it("accepts a fully specified production env", () => {
    const env = parseEnv(FULL_PROD_ENV);
    expect(env.APP_ENV).toBe("production");
    expect(env.BRAND_NAME).toBe("RealBrand");
  });

  it.each(Object.keys(FULL_PROD_ENV).filter((k) => k !== "APP_ENV"))(
    "throws in production when %s is missing (no prod defaults, ever)",
    (key) => {
      const env = { ...FULL_PROD_ENV } as Record<string, string>;
      delete env[key];
      expect(() => parseEnv(env)).toThrow(/Environment validation failed/);
    },
  );

  it("applies dev defaults outside production for non-secret keys", () => {
    const env = parseEnv({
      APP_ENV: "local",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon",
      SUPABASE_SERVICE_ROLE_KEY: "local-service",
    });
    expect(env.BRAND_NAME).toBe("Portal (dev)");
    expect(env.DATABASE_URL).toContain("127.0.0.1:54332");
  });

  it("never defaults secrets, even in dev", () => {
    expect(() => parseEnv({ APP_ENV: "local" })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it("rejects an unknown APP_ENV", () => {
    expect(() =>
      parseEnv({ ...FULL_PROD_ENV, APP_ENV: "prod" }),
    ).toThrow(/Environment validation failed/);
  });
});
