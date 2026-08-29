import { describe, expect, it } from "vitest";
import { renderLlmsTxt } from "@/lib/discovery/llms";
import { buildRobotsPolicy } from "@/lib/discovery/robots";
import { categoryItemListJsonLd, serializeJsonLd } from "@/lib/schema";
import type { CategoryDTO } from "@/lib/public-read/dto";

describe("machine-readable discovery", () => {
  it("renders a branded llms.txt with canonical discovery and trust links", () => {
    const text = renderLlmsTxt({ brandName: "808eventures", origin: "https://guide.example" });
    expect(text).toContain("# 808eventures");
    expect(text).toContain("[English directory](https://guide.example/)");
    expect(text).toContain("[Japanese directory](https://guide.example/ja)");
    expect(text).toContain("[How information is verified](https://guide.example/trust)");
    expect(text).toContain("[XML sitemap](https://guide.example/sitemap.xml)");
    expect(text).not.toContain("localhost");
  });

  it.each(["local", "test", "staging"] as const)("blocks every crawler in %s", (appEnv) => {
    expect(buildRobotsPolicy({ appEnv, origin: "https://preview.example" })).toEqual({
      rules: [{ userAgent: "*", disallow: "/" }],
    });
  });

  it("allows production crawling, including the configured AI allowlist", () => {
    expect(buildRobotsPolicy({
      appEnv: "production",
      origin: "https://guide.example",
      allowlist: ["GPTBot", "ClaudeBot"],
    })).toEqual({
      rules: [
        { userAgent: "*", allow: "/" },
        { userAgent: "GPTBot", allow: "/" },
        { userAgent: "ClaudeBot", allow: "/" },
      ],
      sitemap: "https://guide.example/sitemap.xml",
      host: "https://guide.example",
    });
  });

  it("maps reviewed category results to a locale-canonical ItemList", () => {
    const category: CategoryDTO = {
      id: "category-id",
      slug: "ラーメン",
      label: "ラーメン",
      listings: [{
        slug: "アロハラーメンハレ",
        name: "アロハ・ラーメン・ハレ",
        priceBand: "$$",
        primaryCategoryLabel: "ラーメン",
        photo: null,
        neighborhood: "ワイキキ",
      }],
    };
    const node = categoryItemListJsonLd(category, { origin: "https://guide.example", locale: "ja" });
    expect(node).toMatchObject({
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: 1,
      itemListElement: [{
        "@type": "ListItem",
        position: 1,
        name: "アロハ・ラーメン・ハレ",
        url: "https://guide.example/ja/spot/%E3%82%A2%E3%83%AD%E3%83%8F%E3%83%A9%E3%83%BC%E3%83%A1%E3%83%B3%E3%83%8F%E3%83%AC",
      }],
    });
  });

  it("escapes script-closing text in JSON-LD", () => {
    const serialized = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
