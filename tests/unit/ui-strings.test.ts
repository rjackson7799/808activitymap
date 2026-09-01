import { describe, expect, it } from "vitest";
import { ui } from "@/lib/i18n/ui";

describe("route loading copy", () => {
  it.each([
    ["en", "Loading page…"],
    ["ja", "ページを読み込んでいます…"],
    ["ko", "페이지를 불러오는 중…"],
  ] as const)("provides first-party copy for %s", (locale, expected) => {
    expect(ui(locale).loading).toBe(expected);
  });
});
