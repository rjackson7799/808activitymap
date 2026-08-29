import { env } from "@/config/env";
import { renderLlmsTxt } from "@/lib/discovery/llms";
import { toOrigin } from "@/lib/public-read/paths";

export const revalidate = 3600;

export function GET(): Response {
  const config = env();
  const body = renderLlmsTxt({
    brandName: config.BRAND_NAME,
    origin: toOrigin(config.PORTAL_DOMAIN),
  });

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
