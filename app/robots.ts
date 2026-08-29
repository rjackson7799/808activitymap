import type { MetadataRoute } from "next";
import { env } from "@/config/env";
import { buildRobotsPolicy } from "@/lib/discovery/robots";
import { getAppConfig } from "@/lib/public-read/server";
import { toOrigin } from "@/lib/public-read/paths";

/**
 * robots.txt (CP4, PRD §15). Staging/local/test → disallow everything (noindex, keeps
 * pre-launch content out of the index). Production → allow crawling + the documented
 * AI-crawler allowlist (robots_allowlist config), plus the sitemap. AI visibility is a
 * capability, never a ranking promise (PRD §9).
 */
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const config = env();
  const origin = toOrigin(config.PORTAL_DOMAIN);

  if (config.APP_ENV !== "production") {
    return buildRobotsPolicy({ appEnv: config.APP_ENV, origin });
  }

  const allowlist = (await getAppConfig()).robots_allowlist;
  return buildRobotsPolicy({ appEnv: config.APP_ENV, origin, allowlist });
}
