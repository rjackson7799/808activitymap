import { describe, expect, it } from "vitest";
import { listViewState, itemViewState } from "@/lib/view-state";

/**
 * Pure screen view-state selectors (CP3). Admin screens must render distinct
 * empty AND error states per screen (TSD P1-2). The pages render off these
 * selectors, so the branch logic is asserted here in node — no React test
 * harness needed, matching the codebase's pure-function testing style.
 */

describe("listViewState", () => {
  it("error takes precedence and carries a user-facing message", () => {
    const s = listViewState<{ id: string }>(null, { code: "P0001", message: "permission_denied: nope" });
    expect(s.kind).toBe("error");
    if (s.kind === "error") expect(s.message).toMatch(/permission/i);
  });

  it("empty when the query succeeds with zero rows", () => {
    expect(listViewState([], null)).toEqual({ kind: "empty" });
    expect(listViewState<null>(null, null)).toEqual({ kind: "empty" });
  });

  it("ok with data when rows are present", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(listViewState(rows, null)).toEqual({ kind: "ok", data: rows });
  });
});

describe("itemViewState", () => {
  it("error on a query failure", () => {
    const s = itemViewState<{ id: string }>(null, { code: "23505", message: "duplicate key value" });
    expect(s.kind).toBe("error");
  });

  it("not-found (error kind, notFound flag) when the row is absent", () => {
    const s = itemViewState<{ id: string }>(null, null);
    expect(s.kind).toBe("error");
    if (s.kind === "error") expect(s.notFound).toBe(true);
  });

  it("ok when the row is present", () => {
    const row = { id: "a" };
    expect(itemViewState(row, null)).toEqual({ kind: "ok", data: row });
  });
});
