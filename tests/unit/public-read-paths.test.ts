import { describe, expect, it } from "vitest";
import { hasMalformedPercentEncoding } from "@/lib/public-read/paths";

describe("public route encoding", () => {
  it.each(["%E0%A4%A", "%25E0%25A4%25A"])("rejects malformed segment %s", (segment) => {
    expect(hasMalformedPercentEncoding(segment)).toBe(true);
  });

  it.each(["aloha-ramen-hale", "%E3%81%82", "%25E3%2581%2582", "%2525"])(
    "accepts valid segment %s",
    (segment) => {
      expect(hasMalformedPercentEncoding(segment)).toBe(false);
    },
  );
});
