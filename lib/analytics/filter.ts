import type { AppConfig } from "@/config/app-config";

/**
 * Ingestion drop filters (PRD §16 / TSD §8): bots and prefetch/preload hits are
 * dropped silently before insert. Pure — the UA denylist comes from
 * `app_config.bot_filter`. (The list includes "lighthouse"/"headless", so
 * synthetic and CI page loads never pollute `events`.)
 */

export function isBot(userAgent: string | null, botFilter: AppConfig["bot_filter"]): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return botFilter.ua_contains.some((s) => ua.includes(s.toLowerCase()));
}

/**
 * A speculative request (Next `<Link>` prefetch, RSC prefetch, browser
 * preload) — not a real view. These headers are only present on
 * navigations/prefetches the proxy forwards; the explicit client beacon never
 * sets them.
 */
export function isPrefetch(headers: Headers): boolean {
  if (headers.get("next-router-prefetch") === "1") return true;
  if (headers.get("purpose") === "prefetch") return true;
  const secPurpose = headers.get("sec-purpose");
  if (secPurpose && secPurpose.includes("prefetch")) return true;
  return false;
}
