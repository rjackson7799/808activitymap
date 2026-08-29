import type { MetadataRoute } from "next";
import type { AppEnv } from "@/config/env";

interface RobotsOptions {
  appEnv: AppEnv;
  origin: string;
  allowlist?: string[];
}

/** Pure policy builder so the production and pre-production behavior is testable. */
export function buildRobotsPolicy({
  appEnv,
  origin,
  allowlist = [],
}: RobotsOptions): MetadataRoute.Robots {
  if (appEnv !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...allowlist.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
