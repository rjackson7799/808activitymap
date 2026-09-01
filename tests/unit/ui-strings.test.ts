import { describe, expect, it } from "vitest";
import { ui } from "@/lib/i18n/ui";

describe("public empty-state copy", () => {
  it.each(["en", "ja", "ko"] as const)("is complete for %s", (locale) => {
    const strings = ui(locale);
    expect(strings.browseEmptyTitle).not.toHaveLength(0);
    expect(strings.browseEmptyBody).not.toHaveLength(0);
    expect(strings.categoryEmptyTitle).not.toHaveLength(0);
    expect(strings.categoryEmptyBody("Category")).toContain("Category");
  });
});
