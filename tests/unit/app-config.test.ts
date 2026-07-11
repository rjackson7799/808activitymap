import { describe, expect, it } from "vitest";
import {
  APP_CONFIG_REGISTRY,
  parseAppConfig,
  type AppConfigKey,
} from "@/config/app-config";

const allKeys = Object.keys(APP_CONFIG_REGISTRY) as AppConfigKey[];

/** Full row set = every registry key at its devDefault value. */
function fullRows(): Record<string, unknown> {
  return Object.fromEntries(
    allKeys.map((k) => [k, APP_CONFIG_REGISTRY[k].devDefault]),
  );
}

describe("parseAppConfig — fail-closed contract (§23)", () => {
  it("parses a complete row set in production", () => {
    const config = parseAppConfig(fullRows(), "production");
    expect(config.locale_availability["oahu-waikiki"]).toEqual(["en", "ja"]);
    expect(config.extraction_confidence_threshold).toBe(0.8);
  });

  it.each(allKeys)(
    "throws in production when %s is missing (no code defaults in prod)",
    (key) => {
      const rows = fullRows();
      delete rows[key];
      expect(() => parseAppConfig(rows, "production")).toThrow(
        new RegExp(`missing required key "${key}"`),
      );
    },
  );

  it("throws outside production when a critical key is missing", () => {
    const criticalKeys = allKeys.filter(
      (k) => APP_CONFIG_REGISTRY[k].critical,
    );
    expect(criticalKeys.length).toBeGreaterThan(0);
    for (const key of criticalKeys) {
      const rows = fullRows();
      delete rows[key];
      expect(() => parseAppConfig(rows, "local")).toThrow(
        new RegExp(`missing required key "${key}"`),
      );
    }
  });

  it("falls back to devDefault outside production for non-critical keys", () => {
    const rows = fullRows();
    delete rows.report_delivery_day;
    const config = parseAppConfig(rows, "local");
    expect(config.report_delivery_day).toBe(3);
  });

  it("rejects unregistered keys (drift guard)", () => {
    const rows = { ...fullRows(), mystery_key: 1 };
    expect(() => parseAppConfig(rows, "local")).toThrow(
      /unregistered keys: mystery_key/,
    );
  });

  it("rejects invalid values with key context", () => {
    const rows = { ...fullRows(), extraction_confidence_threshold: 42 };
    expect(() => parseAppConfig(rows, "local")).toThrow(
      /"extraction_confidence_threshold" is invalid/,
    );
  });

  it("referrer classification classes exclude `unknown` in rules (it is the fallback, always present)", () => {
    const config = parseAppConfig(fullRows(), "local");
    const classes = config.referrer_classification.rules.map((r) => r.class);
    expect(classes).not.toContain("unknown");
  });

  it("every devDefault satisfies its own schema", () => {
    for (const key of allKeys) {
      const def = APP_CONFIG_REGISTRY[key];
      expect(
        def.schema.safeParse(def.devDefault).success,
        `devDefault for ${key} must parse`,
      ).toBe(true);
    }
  });
});
