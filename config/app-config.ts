import { z } from "zod";
import { LOCALES } from "@/lib/locales";

/**
 * Runtime configuration registry (PRD §22 · TSD §23).
 *
 * Every PRD §22 value is a row in `app_config` (jsonb), never a constant in
 * code. This registry is the typed contract for those rows: per-key Zod
 * schema, description, and a dev default.
 *
 * Fail-closed rule (slice-1): keys marked `critical` have NO code default in
 * production — a missing row throws at load. Outside production the
 * `devDefault` applies, and the seed inserts exactly these devDefault values
 * (a db test asserts seed ↔ registry agreement, so values live here once).
 */

const localeSchema = z.enum(LOCALES);

function entry<S extends z.ZodType>(def: {
  description: string;
  schema: S;
  devDefault: z.infer<S>;
  critical?: boolean;
}) {
  return { critical: false, ...def };
}

export const APP_CONFIG_REGISTRY = {
  // ── Publication / freshness ─────────────────────────────────────────────
  staleness_thresholds_days: entry({
    description:
      "Provenance staleness threshold per field type (days). Past threshold: publish-time blocker `provenance_expired`; post-publish → amber chip per D15, never auto-unpublish.",
    schema: z.record(
      z.enum(["hours", "price", "menu", "business_fact", "editorial_note"]),
      z.number().int().positive(),
    ),
    devDefault: {
      hours: 90,
      price: 120,
      menu: 180,
      business_fact: 365,
      editorial_note: 90, // PRD §18: editorial review 60–90 days
    },
  }),
  badge_freshness_rules: entry({
    description:
      "Verified-badge auto-suspension rules (D15): badge suspends when any badge-relevant field's provenance is stale.",
    schema: z.object({
      badge_fields: z.array(z.string().min(1)),
      suspend_on_stale: z.boolean(),
    }),
    devDefault: {
      badge_fields: ["name", "address", "geo", "phone", "hours", "photo", "primary_category"],
      suspend_on_stale: true,
    },
  }),
  public_surface_enabled: entry({
    description:
      "Kill switch for the entire public surface (slice-1 rollback acceptance). false → public routes return holding page.",
    schema: z.boolean(),
    devDefault: true,
    critical: true,
  }),

  // ── Locales / market ────────────────────────────────────────────────────
  locale_availability: entry({
    description:
      "Publicly served locales per market (D2/D3). KO flips on in Slice 2 — schema is KO-capable, serving is config.",
    schema: z.record(z.string().min(1), z.array(localeSchema).min(1)),
    devDefault: { "oahu-waikiki": ["en", "ja"] },
    critical: true,
  }),

  // ── Content pipeline ────────────────────────────────────────────────────
  extraction_confidence_threshold: entry({
    description:
      "Menu-extraction confidence below which price/allergen fields require human confirmation before QA (PRD §6).",
    schema: z.number().min(0).max(1),
    devDefault: 0.8,
  }),
  max_subcategories_per_listing: entry({
    description: "Maximum subcategories attachable to one listing (PRD §14).",
    schema: z.number().int().positive(),
    devDefault: 3,
  }),
  moderation_thresholds: entry({
    description:
      "Flag counts that open a moderation case / hide content pending review (PRD §22).",
    schema: z.object({
      closure_reports_to_flag: z.number().int().positive(),
      photo_flags_to_hide: z.number().int().positive(),
    }),
    devDefault: { closure_reports_to_flag: 2, photo_flags_to_hide: 3 },
  }),
  queue_sla_targets_hours: entry({
    description: "Ops queue SLA targets in hours (PRD §22, §20 criteria).",
    schema: z.record(
      z.enum(["moderation", "qa_ja", "qa_ko", "claims", "corrections"]),
      z.number().int().positive(),
    ),
    devDefault: {
      moderation: 48,
      qa_ja: 72,
      qa_ko: 72,
      claims: 72,
      corrections: 48,
    },
  }),

  // ── Billing (consumed Slice 5; shape fixed now so §22 is complete) ─────
  grace_period_days: entry({
    description: "Days in `grace` after dunning exhausts (PRD §13, TSD §11).",
    schema: z.number().int().positive(),
    devDefault: 14,
  }),
  dunning_schedule_days: entry({
    description: "Dunning email offsets in days from first failure (PRD §17).",
    schema: z.array(z.number().int().nonnegative()).min(1),
    devDefault: [0, 3, 7],
  }),
  founding_price_hold_window_days: entry({
    description:
      "How long a lapsed founding subscriber can return at the founding price (D13; pilot decision).",
    schema: z.number().int().nonnegative(),
    devDefault: 30,
  }),
  plan_entitlements: entry({
    description:
      "Plan → entitlement-key map (PRD §13). Consumed by computeEntitlements() in Slice 5; stored now so the §22 registry is complete from day one.",
    schema: z.record(
      z.string().min(1),
      z.array(
        z.enum([
          "badge",
          "translated_menus",
          "analytics",
          "report",
          "deals",
          "priority",
          "team_seats",
        ]),
      ),
    ),
    devDefault: {
      free: [],
      founding: [
        "badge",
        "translated_menus",
        "analytics",
        "report",
        "deals",
        "priority",
        "team_seats",
      ],
    },
  }),

  // ── Reminder cadences (PRD §17 matrix; timings are config) ─────────────
  menu_approval_reminder_days: entry({
    description: "Vendor menu-approval reminder offsets (PRD §17: day 3/7/14).",
    schema: z.array(z.number().int().positive()).min(1),
    devDefault: [3, 7, 14],
  }),
  onboarding_reminder_days: entry({
    description:
      "Onboarding-incomplete reminder offsets; ops task at the last value +3 (PRD §17: day 3/7, ops day 10).",
    schema: z.array(z.number().int().positive()).min(1),
    devDefault: [3, 7],
  }),
  report_delivery_day: entry({
    description: "Day of month monthly vendor reports are generated (PRD §17).",
    schema: z.number().int().min(1).max(28),
    devDefault: 3,
  }),

  // ── Deals / affiliate (consumed Slice 7) ───────────────────────────────
  deal_expiration_behavior: entry({
    description:
      "Deal expiry handling: expired reveal returns 410 + alternatives (companion E2.1).",
    schema: z.object({
      show_alternatives: z.boolean(),
      alternatives_count: z.number().int().nonnegative(),
    }),
    devDefault: { show_alternatives: true, alternatives_count: 3 },
  }),
  affiliate_module_ordering: entry({
    description: "Ordered affiliate-module keys for listing pages (PRD §22).",
    schema: z.array(z.string()),
    devDefault: [],
  }),

  // ── Analytics / SEO ─────────────────────────────────────────────────────
  referrer_classification: entry({
    description:
      "Versioned referrer→class rules (D21). Classes fixed by PRD §16; `unknown` always present as fallback. Best-effort, experimental (P1-11).",
    schema: z.object({
      version: z.number().int().positive(),
      rules: z.array(
        z.object({
          class: z.enum([
            "organic",
            "ai",
            "social",
            "direct",
            "influencer",
            "qr",
          ]),
          // Substring matches, case-insensitive; first hit wins, else `unknown`.
          referrer_contains: z.array(z.string()).optional(),
          ua_contains: z.array(z.string()).optional(),
          query_param: z.string().optional(),
        }),
      ),
    }),
    devDefault: {
      version: 1,
      rules: [
        { class: "qr", query_param: "qr" },
        {
          class: "ai",
          referrer_contains: [
            "chatgpt.com",
            "chat.openai.com",
            "claude.ai",
            "perplexity.ai",
            "gemini.google.com",
            "copilot.microsoft.com",
          ],
          ua_contains: ["GPTBot", "ClaudeBot", "Claude-User", "PerplexityBot"],
        },
        {
          class: "social",
          referrer_contains: [
            "instagram.com",
            "facebook.com",
            "t.co",
            "twitter.com",
            "x.com",
            "tiktok.com",
            "youtube.com",
            "line.me",
          ],
        },
        {
          class: "organic",
          referrer_contains: [
            "google.",
            "bing.com",
            "duckduckgo.com",
            "search.yahoo.",
            "yahoo.co.jp",
            "naver.com",
            "daum.net",
          ],
        },
      ],
    },
  }),
  robots_allowlist: entry({
    description:
      "Documented AI-crawler allowlist for robots.txt (PRD §15; reviewed quarterly).",
    schema: z.array(z.string().min(1)),
    devDefault: [
      "GPTBot",
      "ClaudeBot",
      "Claude-User",
      "PerplexityBot",
      "Google-Extended",
      "Bingbot",
    ],
  }),
  bot_filter: entry({
    description:
      "Analytics ingestion bot filter: UA substrings dropped silently before insert (TSD §8 /api/events).",
    schema: z.object({ ua_contains: z.array(z.string().min(1)) }),
    devDefault: {
      ua_contains: [
        "bot",
        "crawler",
        "spider",
        "curl",
        "wget",
        "python-requests",
        "headless",
        "lighthouse",
        "pingdom",
        "uptimerobot",
      ],
    },
  }),
  rate_limits: entry({
    description:
      "Fixed-window rate limits (slice-1 analytics §): per-window caps for public ingestion/reveal endpoints. Fail-open for ingestion (drops logged), fail-closed for reveal.",
    schema: z.object({
      window_minutes: z.number().int().positive(),
      events_per_ip: z.number().int().positive(),
      events_per_session: z.number().int().positive(),
      reveals_per_ip: z.number().int().positive(),
    }),
    devDefault: {
      window_minutes: 10,
      events_per_ip: 600,
      events_per_session: 300,
      reveals_per_ip: 30,
    },
    critical: true,
  }),
  correction_rate_limits: entry({
    description: "Fixed-window rate limits for public correction intake. Writes fail closed if the limiter is unavailable.",
    schema: z.object({
      per_ip: z.number().int().positive(),
      per_session: z.number().int().positive(),
    }),
    devDefault: { per_ip: 5, per_session: 3 },
  }),
  business_inquiry_rate_limits: entry({
    description: "Fixed-window rate limits for public business-interest intake. Writes fail closed if the limiter is unavailable.",
    schema: z.object({
      per_ip: z.number().int().positive(),
      per_session: z.number().int().positive(),
    }),
    devDefault: { per_ip: 4, per_session: 2 },
  }),
  retention_days: entry({
    description:
      "Data-retention obligations (PRD §19): events rows, hashed-IP/abuse data (90d), claim evidence (24mo). Enforcement jobs arrive with their surfaces; values are contract now.",
    schema: z.object({
      events: z.number().int().positive(),
      ip_abuse: z.number().int().positive(),
      claim_evidence: z.number().int().positive(),
    }),
    devDefault: { events: 730, ip_abuse: 90, claim_evidence: 730 },
  }),
} as const;

export type AppConfigKey = keyof typeof APP_CONFIG_REGISTRY;

export type AppConfig = {
  [K in AppConfigKey]: z.infer<(typeof APP_CONFIG_REGISTRY)[K]["schema"]>;
};

/**
 * Validate raw `app_config` rows (key → jsonb value) into a typed AppConfig.
 * Pure: DB fetch happens in the server-only loader that wraps this.
 *
 * - Unknown DB keys → error (registry is the contract; stray rows are drift).
 * - Missing key: production or `critical` in any env → throw (fail-closed);
 *   otherwise devDefault.
 * - Invalid value → throw with key context.
 */
export function parseAppConfig(
  rows: Record<string, unknown>,
  appEnv: string,
): AppConfig {
  const isProd = appEnv === "production";
  const unknown = Object.keys(rows).filter(
    (k) => !(k in APP_CONFIG_REGISTRY),
  );
  if (unknown.length > 0) {
    throw new Error(`app_config contains unregistered keys: ${unknown.join(", ")}`);
  }

  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(APP_CONFIG_REGISTRY)) {
    const raw = rows[key];
    if (raw === undefined) {
      if (isProd || def.critical) {
        throw new Error(
          `app_config missing required key "${key}" (fail-closed: no defaults for ${isProd ? "production" : "critical keys"})`,
        );
      }
      out[key] = def.devDefault;
      continue;
    }
    const parsed = def.schema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `app_config value for "${key}" is invalid: ${parsed.error.message}`,
      );
    }
    out[key] = parsed.data;
  }
  return out as AppConfig;
}
