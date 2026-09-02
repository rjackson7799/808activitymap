import { describe, expect, it } from "vitest";
import { CONFIG_GROUPS, formatAdminConfigValue, parseAdminConfigValue } from "@/config/admin-config";
import { APP_CONFIG_REGISTRY } from "@/config/app-config";

describe("admin configuration registry", () => {
  it("groups every registered key exactly once", () => {
    const grouped = CONFIG_GROUPS.flatMap((group) => [...group.keys]);
    expect(grouped.sort()).toEqual(Object.keys(APP_CONFIG_REGISTRY).sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("parses and validates JSON against the selected key schema", () => {
    expect(parseAdminConfigValue("report_delivery_day", "7")).toEqual({ success: true, value: 7 });
    expect(parseAdminConfigValue("report_delivery_day", "31")).toEqual(expect.objectContaining({ success: false }));
    expect(parseAdminConfigValue("public_surface_enabled", "\"true\"")).toEqual(expect.objectContaining({ success: false }));
  });

  it("rejects malformed JSON and unregistered keys", () => {
    expect(parseAdminConfigValue("report_delivery_day", "not-json")).toEqual(expect.objectContaining({ success: false }));
    expect(parseAdminConfigValue("future_feature", "true")).toEqual(expect.objectContaining({ success: false }));
  });

  it("formats nested values as readable JSON", () => {
    expect(formatAdminConfigValue({ enabled: true, days: [3, 7] })).toBe('{\n  "enabled": true,\n  "days": [\n    3,\n    7\n  ]\n}');
  });
});
