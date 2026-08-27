import { describe, expect, it } from "vitest";
import { APP_CONFIG_REGISTRY } from "@/config/app-config";
import { clientIpFromHeaders, hashIp, normalizeIp } from "@/lib/analytics/ip";
import { classifyReferrer } from "@/lib/analytics/referrer";
import { isBot, isPrefetch } from "@/lib/analytics/filter";

const BOT_FILTER = APP_CONFIG_REGISTRY.bot_filter.devDefault;
const REFERRER_RULES = APP_CONFIG_REGISTRY.referrer_classification.devDefault;

describe("ip", () => {
  it("takes the leftmost x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.7");
  });

  it("returns null with no forwarded-for", () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });

  it("leaves IPv4 unchanged and reduces IPv6 to its /64 network", () => {
    expect(normalizeIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("2001:0db8:85a3:1111:2222:3333:4444:5555")).toBe("2001:db8:85a3:1111::/64");
    // `::` abbreviation is expanded before slicing to /64
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("hashes deterministically and diverges by pepper (not reversible)", () => {
    const a = hashIp("203.0.113.7", "pepper-1");
    expect(a).toBe(hashIp("203.0.113.7", "pepper-1"));
    expect(a).not.toBe(hashIp("203.0.113.7", "pepper-2"));
    expect(a).not.toMatch(/203\.0\.113\.7/); // no raw IP survives
    // same /64 → same hash regardless of host bits
    expect(hashIp("2001:db8:85a3:1111:0:0:0:1", "p")).toBe(
      hashIp("2001:db8:85a3:1111:ffff:ffff:ffff:ffff", "p"),
    );
  });
});

describe("classifyReferrer", () => {
  it("classifies AI referrers", () => {
    expect(classifyReferrer(REFERRER_RULES, { referer: "https://chatgpt.com/", userAgent: null })).toBe("ai");
  });
  it("classifies social referrers", () => {
    expect(classifyReferrer(REFERRER_RULES, { referer: "https://instagram.com/x", userAgent: null })).toBe("social");
  });
  it("classifies organic search referrers", () => {
    expect(classifyReferrer(REFERRER_RULES, { referer: "https://www.google.com/search", userAgent: null })).toBe("organic");
  });
  it("classifies a qr landing via query param", () => {
    expect(
      classifyReferrer(REFERRER_RULES, { referer: null, userAgent: null, landingQuery: "utm=x&qr=table12" }),
    ).toBe("qr");
  });
  it("is direct when there is no referer", () => {
    expect(classifyReferrer(REFERRER_RULES, { referer: null, userAgent: null })).toBe("direct");
  });
  it("is unknown when a referer is present but matches no rule", () => {
    expect(classifyReferrer(REFERRER_RULES, { referer: "https://some-blog.example/", userAgent: null })).toBe("unknown");
  });
});

describe("filter", () => {
  it("drops known bot/synthetic UAs, keeps a real browser UA", () => {
    expect(isBot("Mozilla/5.0 ... HeadlessChrome/120", BOT_FILTER)).toBe(true);
    expect(isBot("Chrome-Lighthouse", BOT_FILTER)).toBe(true);
    expect(isBot("curl/8.0", BOT_FILTER)).toBe(true);
    expect(
      isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1", BOT_FILTER),
    ).toBe(false);
    expect(isBot(null, BOT_FILTER)).toBe(false);
  });

  it("detects prefetch/preload requests", () => {
    expect(isPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetch(new Headers({ purpose: "prefetch" }))).toBe(true);
    expect(isPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isPrefetch(new Headers({ "sec-fetch-dest": "document" }))).toBe(false);
  });
});
