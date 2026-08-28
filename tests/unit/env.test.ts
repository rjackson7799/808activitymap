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

const DEV_SECRET_VALUES = {
  IP_HASH_PEPPER: "dev-ip-hash-pepper-not-a-secret",
  EVENTS_INTERNAL_TOKEN: "dev-events-internal-token",
  CRON_SECRET: "dev-cron-secret",
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

  it.each(["local", "test"] as const)(
    "applies convenience defaults only in explicit %s mode",
    (APP_ENV) => {
      const env = parseEnv({
        APP_ENV,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon",
        SUPABASE_SERVICE_ROLE_KEY: "local-service",
      });
      expect(env.BRAND_NAME).toBe("Portal (dev)");
      expect(env.DATABASE_URL).toContain("127.0.0.1:54332");
      expect(env).toMatchObject(DEV_SECRET_VALUES);
    },
  );

  it("never defaults externally provisioned Supabase keys, even locally", () => {
    expect(() => parseEnv({ APP_ENV: "local" })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it.each(Object.keys(DEV_SECRET_VALUES))(
    "throws in staging when %s is missing",
    (key) => {
      const env = { ...FULL_PROD_ENV, APP_ENV: "staging" } as Record<string, string>;
      delete env[key];
      expect(() => parseEnv(env)).toThrow(/Environment validation failed/);
    },
  );

  it.each(Object.entries(DEV_SECRET_VALUES))(
    "rejects the known development literal for %s in hosted environments",
    (key, value) => {
      for (const APP_ENV of ["staging", "production"] as const) {
        expect(() => parseEnv({ ...FULL_PROD_ENV, APP_ENV, [key]: value })).toThrow(
          new RegExp(key),
        );
      }
    },
  );

  it("does not interpret a missing APP_ENV as local", () => {
    const { APP_ENV: _, ...withoutAppEnv } = FULL_PROD_ENV;
    expect(() => parseEnv(withoutAppEnv)).toThrow(/APP_ENV=unset/);
  });

  it("rejects an unknown APP_ENV", () => {
    expect(() =>
      parseEnv({ ...FULL_PROD_ENV, APP_ENV: "prod" }),
    ).toThrow(/Environment validation failed/);
  });
});
