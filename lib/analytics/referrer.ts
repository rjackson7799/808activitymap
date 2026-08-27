import type { AppConfig } from "@/config/app-config";

/**
 * Referrer classification (PRD §16 / D21, P1-11 — best-effort, experimental).
 * Pure + config-driven: the versioned rules live in `app_config`
 * (`referrer_classification`). First matching rule wins; a hit on any of
 * query-param / referer-substring / UA-substring classifies the event.
 *
 * With no rule matched: a present referer → `unknown` (came from somewhere we
 * don't recognise); an absent referer → `direct`.
 */

export type ReferrerClass = "organic" | "ai" | "social" | "direct" | "influencer" | "qr" | "unknown";

export interface ReferrerContext {
  referer: string | null;
  userAgent: string | null;
  /** Query string of the landing URL (for query_param rules like ?qr=…). */
  landingQuery?: string | null;
}

function includesCI(haystack: string | null, needle: string): boolean {
  return haystack !== null && haystack.toLowerCase().includes(needle.toLowerCase());
}

export function classifyReferrer(
  rules: AppConfig["referrer_classification"],
  ctx: ReferrerContext,
): ReferrerClass {
  const params = ctx.landingQuery ? new URLSearchParams(ctx.landingQuery) : null;

  for (const rule of rules.rules) {
    if (rule.query_param && params?.has(rule.query_param)) return rule.class;
    if (rule.referrer_contains?.some((s) => includesCI(ctx.referer, s))) return rule.class;
    if (rule.ua_contains?.some((s) => includesCI(ctx.userAgent, s))) return rule.class;
  }
  return ctx.referer ? "unknown" : "direct";
}
