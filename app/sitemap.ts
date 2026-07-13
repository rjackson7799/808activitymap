import type { MetadataRoute } from "next";
import { env } from "@/config/env";
import { getSitemapRows } from "@/lib/public-read/server";
import { absoluteUrl, toOrigin } from "@/lib/public-read/paths";

/**
 * Sitemap (CP4). Publishable pages ONLY (via the read model, gated by the eligibility
 * view): home + eligible category + listing pages. Absolute URLs from PORTAL_DOMAIN,
 * native-script slugs percent-encoded, NO romanized aliases, NO KO. Tagged `sitemap` so a
 * publish/unpublish invalidates it within the ISR window.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = toOrigin(env().PORTAL_DOMAIN);
  const rows = await getSitemapRows();
  return rows.map((row) => ({
    url: absoluteUrl(origin, row.path),
    changeFrequency: "weekly",
    priority: row.path === "/" ? 1 : 0.7,
  }));
}
