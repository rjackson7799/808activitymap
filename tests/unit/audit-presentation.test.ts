import { describe, expect, it } from "vitest";
import {
  changedAuditFields,
  formatAuditSnapshot,
  formatAuditTimestamp,
  humanizeAuditValue,
} from "@/lib/audit/presentation";

describe("audit presentation", () => {
  it("humanizes database identifiers", () => {
    expect(humanizeAuditValue("listing_locales")).toBe("Listing Locales");
    expect(humanizeAuditValue("UPDATE")).toBe("UPDATE");
  });

  it("lists only changed fields in a stable order", () => {
    expect(
      changedAuditFields(
        { id: "same", name: "Old", status: "draft" },
        { id: "same", name: "New", status: "published", version: 2 },
      ),
    ).toEqual(["name", "status", "version"]);
  });

  it("handles insert and delete snapshots", () => {
    expect(changedAuditFields(null, { id: "new", active: true })).toEqual(["active", "id"]);
    expect(changedAuditFields({ id: "old" }, null)).toEqual(["id"]);
    expect(formatAuditSnapshot(null)).toBe("Not applicable");
  });

  it("formats timestamps in the operating timezone", () => {
    expect(formatAuditTimestamp("2026-09-01T05:06:20Z")).toBe("Aug 31, 2026, 7:06 PM");
  });
});
