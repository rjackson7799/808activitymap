import { describe, expect, it } from "vitest";
import {
  approvalAgeDays,
  canRecordExternalMenuApproval,
  hasApprovalIntegrityIssue,
  nextReminderDay,
  sortMenuApprovalQueue,
  summarizeMenuApprovals,
  type MenuApprovalQueueItem,
} from "@/lib/menu-approvals/admin";

const item = (overrides: Partial<MenuApprovalQueueItem> = {}): MenuApprovalQueueItem => ({
  id: "item-1",
  listingId: "listing-1",
  listingName: "Fixture Ramen",
  locale: "en",
  menuVersion: 1,
  status: "qa_approved",
  approvalType: null,
  evidenceMediaId: null,
  evidencePath: null,
  approvedBy: null,
  approvedAt: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
  ...overrides,
});

describe("Phase 0 external menu approval policy", () => {
  it("allows the exact staff roles supported by the guarded transition", () => {
    for (const role of ["super_admin", "publisher", "editor", "ops_agent"] as const) {
      expect(canRecordExternalMenuApproval([role]), role).toBe(true);
    }
    for (const role of ["language_reviewer_ja", "language_reviewer_ko"] as const) {
      expect(canRecordExternalMenuApproval([role]), role).toBe(false);
    }
  });

  it("prioritizes the oldest pending records ahead of recent completed records", () => {
    const rows = sortMenuApprovalQueue([
      item({ id: "published", status: "published", updatedAt: "2026-09-01T00:00:00.000Z" }),
      item({ id: "new-pending", updatedAt: "2026-08-30T00:00:00.000Z" }),
      item({ id: "old-pending", status: "vendor_approval_pending", updatedAt: "2026-08-25T00:00:00.000Z" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["old-pending", "new-pending", "published"]);
  });

  it("uses configured reminder days and reports queue totals", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    expect(approvalAgeDays(item(), now)).toBe(3);
    expect(nextReminderDay(3, [14, 3, 7])).toBe(7);
    expect(nextReminderDay(14, [3, 7, 14])).toBeNull();

    expect(summarizeMenuApprovals([
      item(),
      item({ id: "approved", status: "approved", evidenceMediaId: "e", approvedBy: "u", approvedAt: now.toISOString() }),
      item({ id: "published", status: "published", evidenceMediaId: "e", approvedBy: "u", approvedAt: now.toISOString() }),
    ])).toEqual({ pending: 1, recorded: 2, published: 1, integrityIssues: 0 });
  });

  it("flags impossible approved rows defensively without treating a pending row as corrupt", () => {
    expect(hasApprovalIntegrityIssue(item())).toBe(false);
    expect(hasApprovalIntegrityIssue(item({ status: "approved" }))).toBe(true);
  });
});
