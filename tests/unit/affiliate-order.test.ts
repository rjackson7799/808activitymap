import { describe, expect, it } from "vitest";
import { orderAffiliateLinks } from "@/lib/affiliate/order";

describe("affiliate module ordering", () => {
  it("puts configured partner keys first, then preserves staff ordering", () => {
    const links = [
      { partnerKey: "unconfigured", sortOrder: 0 },
      { partnerKey: "second", sortOrder: 50 },
      { partnerKey: "first", sortOrder: 100 },
      { partnerKey: "another", sortOrder: 10 },
    ];
    expect(orderAffiliateLinks(links, ["first", "second"]).map((link) => link.partnerKey))
      .toEqual(["first", "second", "unconfigured", "another"]);
    expect(links.map((link) => link.partnerKey)).toEqual(["unconfigured", "second", "first", "another"]);
  });
});
