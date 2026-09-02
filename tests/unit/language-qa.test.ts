import { describe, expect, it } from "vitest";
import { canReviewLocale, queueAgeHours, sortQaQueue, summarizeQaQueue, type QaQueueItem } from "@/lib/language-qa/admin";

const item = (id: string, updatedAt: string, assignment: QaQueueItem["assignment"] = null): QaQueueItem => ({
  id, type: "listing_locale", listingId: id, listingName: id, locale: "ja", status: "qa_pending", updatedAt, assignment,
});

describe("language QA queue policy", () => {
  it("limits reviewers to their own locale while publisher+ can review both", () => {
    expect(canReviewLocale(["language_reviewer_ja"], "ja")).toBe(true);
    expect(canReviewLocale(["language_reviewer_ja"], "ko")).toBe(false);
    expect(canReviewLocale(["publisher"], "ko")).toBe(true);
    expect(canReviewLocale(["editor"], "ja")).toBe(false);
  });

  it("orders unassigned work before assigned work and oldest first", () => {
    const assigned = { id: "a", assignedTo: "u", assignedAt: "2026-09-01T00:00:00Z", completedAt: null, activeSessionId: null, activeActor: null, activeMinutes: 0 };
    expect(sortQaQueue([
      item("assigned", "2026-09-01T00:00:00Z", assigned),
      item("newer", "2026-09-01T12:00:00Z"),
      item("older", "2026-09-01T06:00:00Z"),
    ]).map((row) => row.id)).toEqual(["older", "newer", "assigned"]);
  });

  it("reports capacity, SLA breaches, and oldest age", () => {
    const now = new Date("2026-09-02T12:00:00Z");
    const active = { id: "a", assignedTo: "u", assignedAt: "2026-09-01T00:00:00Z", completedAt: null, activeSessionId: "s", activeActor: "u", activeMinutes: 12.5 };
    const rows = [item("old", "2026-08-29T12:00:00Z"), item("active", "2026-09-02T10:00:00Z", active)];
    expect(queueAgeHours(rows[0]!, now)).toBe(96);
    expect(summarizeQaQueue(rows, 72, now)).toEqual({ pending: 2, unassigned: 1, active: 1, overSla: 1, oldestHours: 96 });
  });
});
