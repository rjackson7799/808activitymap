import { describe, expect, it } from "vitest";
import { ASSISTED_UPDATE_STAFF_ROLES, canManageAssistedUpdates } from "@/lib/assisted-updates/admin";

describe("assisted update admin access", () => {
  it("allows the Phase 0 operations and editorial roles", () => {
    expect(ASSISTED_UPDATE_STAFF_ROLES).toEqual(["super_admin", "publisher", "editor", "ops_agent"]);
    expect(canManageAssistedUpdates(["super_admin"])).toBe(true);
    expect(canManageAssistedUpdates(["publisher"])).toBe(true);
    expect(canManageAssistedUpdates(["editor"])).toBe(true);
    expect(canManageAssistedUpdates(["ops_agent"])).toBe(true);
  });

  it("keeps the evidence workspace hidden from language reviewers", () => {
    expect(canManageAssistedUpdates(["language_reviewer_ja"])).toBe(false);
    expect(canManageAssistedUpdates(["language_reviewer_ko"])).toBe(false);
    expect(canManageAssistedUpdates([])).toBe(false);
  });
});
