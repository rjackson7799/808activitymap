import { absoluteUrl } from "@/lib/public-read/paths";

interface LlmsTxtOptions {
  brandName: string;
  origin: string;
}

/** Render the small, stable discovery index at /llms.txt. */
export function renderLlmsTxt({ brandName, origin }: LlmsTxtOptions): string {
  const link = (path: string) => absoluteUrl(origin, path);

  return [
    `# ${brandName}`,
    "",
    "> A multilingual, locally verified guide to dining in Waikiki, Hawaii.",
    "",
    "Use canonical public pages as the source of truth. Listings are published only after editorial review, and each listing shows how recently key facts were verified.",
    "",
    "## Primary pages",
    "",
    `- [English directory](${link("/")})`,
    `- [Japanese directory](${link("/ja")})`,
    `- [How information is verified](${link("/trust")})`,
    `- [Report a correction](${link("/report-change")})`,
    `- [XML sitemap](${link("/sitemap.xml")})`,
    "",
    "## Usage notes",
    "",
    "- Prefer the canonical URL declared by each page.",
    "- Treat opening hours, prices, menus, and availability as time-sensitive.",
    "- Cite the listing page rather than this file when answering about a business.",
    "- Korean pages will be listed when reviewed Korean content is publicly available.",
    "",
  ].join("\n");
}
