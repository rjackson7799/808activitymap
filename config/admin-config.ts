import {
  APP_CONFIG_REGISTRY,
  type AppConfigKey,
} from "./app-config";

export const CONFIG_GROUPS = [
  {
    id: "publication",
    label: "Publication & freshness",
    description: "Public availability, verification, and fact-review windows.",
    keys: [
      "public_surface_enabled",
      "staleness_thresholds_days",
      "badge_freshness_rules",
    ],
  },
  {
    id: "market",
    label: "Markets & languages",
    description: "Which reviewed languages are available in each market.",
    keys: ["locale_availability"],
  },
  {
    id: "content",
    label: "Content operations",
    description: "Human-review thresholds, limits, and queue service targets.",
    keys: [
      "extraction_confidence_threshold",
      "max_subcategories_per_listing",
      "moderation_thresholds",
      "queue_sla_targets_hours",
    ],
  },
  {
    id: "reminders",
    label: "Reminders & reporting",
    description: "Operational follow-up and scheduled report timing.",
    keys: [
      "menu_approval_reminder_days",
      "onboarding_reminder_days",
      "report_delivery_day",
    ],
  },
  {
    id: "commercial",
    label: "Commercial policy",
    description: "Phase 1 contracts defined now but not activated by this screen.",
    keys: [
      "grace_period_days",
      "dunning_schedule_days",
      "founding_price_hold_window_days",
      "plan_entitlements",
      "deal_expiration_behavior",
      "affiliate_module_ordering",
    ],
  },
  {
    id: "traffic",
    label: "Traffic, safety & retention",
    description: "Classification, crawler policy, abuse limits, and retention periods.",
    keys: [
      "referrer_classification",
      "robots_allowlist",
      "bot_filter",
      "rate_limits",
      "correction_rate_limits",
      "business_inquiry_rate_limits",
      "retention_days",
    ],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  keys: readonly AppConfigKey[];
}>;

export function isAppConfigKey(value: string): value is AppConfigKey {
  return value in APP_CONFIG_REGISTRY;
}
export function parseAdminConfigValue(
  key: string,
  input: string,
): { success: true; value: unknown } | { success: false; error: string } {
  if (!isAppConfigKey(key)) {
    return { success: false, error: "That configuration key is not registered." };
  }

  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return { success: false, error: "Enter valid JSON, such as true, 3, [1, 2], or {\"key\": \"value\"}." };
  }

  const parsed = APP_CONFIG_REGISTRY[key].schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const location = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    return {
      success: false,
      error: `This value does not match the registry schema${location}: ${issue?.message ?? "invalid value"}.`,
    };
  }

  return { success: true, value: parsed.data };
}

export function formatAdminConfigValue(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
