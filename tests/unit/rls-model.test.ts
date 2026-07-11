import { describe, expect, it } from "vitest";
import { buildModel } from "@/db/rls/model";
import { LIVE_TABLES } from "@/db/rls/availability";
import { PROTECTED_COLUMNS } from "@/db/rls/semantics";

/**
 * Unit contract for the RLS expansion model (matrix ∧ semantics ∧
 * availability). The db-project suites verify the same facts against the
 * live database; this suite pins the pure expansion so a semantics edit
 * that flips a §4 cell fails fast without a DB.
 */

const model = buildModel();

const expectation = (role: string, table: string, op: string) => {
  const found = model.expectations.find(
    (e) => e.role === role && e.table === table && e.op === op,
  );
  if (!found) throw new Error(`no expectation for ${role} ${table} ${op}`);
  return found;
};

describe("policy inventory shape", () => {
  it("emits exactly one policy per (table, op), named {table}_{op}", () => {
    const seen = new Set<string>();
    for (const p of model.policies) {
      expect(p.name).toBe(`${p.table}_${p.op}`);
      expect(seen.has(p.name)).toBe(false);
      seen.add(p.name);
    }
  });

  it("emits policies only for live tables (events family absent)", () => {
    for (const p of model.policies) {
      expect(LIVE_TABLES).toContain(p.table);
    }
    expect(model.policies.some((p) => p.table.startsWith("events"))).toBe(false);
  });

  it("orders policies deterministically (table asc, op in select/insert/update/delete order)", () => {
    const keys = model.policies.map((p) => p.name);
    const opRank = { select: 0, insert: 1, update: 2, delete: 3 } as const;
    const sorted = [...model.policies].sort(
      (a, b) =>
        a.table.localeCompare(b.table) ||
        opRank[a.op as keyof typeof opRank] - opRank[b.op as keyof typeof opRank],
    );
    expect(keys).toEqual(sorted.map((p) => p.name));
  });
});

describe("PRD §4 cells survive expansion (spot checks per row)", () => {
  it("Edit business facts: editor writes listings @aal2; ops_agent does not (propose-only, CR table absent)", () => {
    const editor = expectation("editor", "listings", "update");
    expect(editor.outcome).toBe("allow");
    expect(editor.aal2Required).toBe(true);
    expect(expectation("ops_agent", "listings", "update").outcome).toBe("deny-rls");
  });

  it("Translation row: editor is ✖ on locale content; reviewers own-locale only, no aal2", () => {
    expect(expectation("editor", "listing_locales", "update").outcome).toBe("deny-rls");
    const ja = expectation("language_reviewer_ja", "listing_locales", "update");
    expect(ja.outcome).toBe("allow");
    expect(ja.aal2Required).toBe(false);
    expect(ja.scope).toEqual({ kind: "locale", locale: "ja" });
    const ko = expectation("language_reviewer_ko", "menu_item_locales", "insert");
    expect(ko.outcome).toBe("allow");
    expect(ko.scope).toEqual({ kind: "locale", locale: "ko" });
  });

  it("publisher/super_admin translation writes are unscoped but aal2-gated", () => {
    const pub = expectation("publisher", "listing_locales", "update");
    expect(pub.outcome).toBe("allow");
    expect(pub.aal2Required).toBe(true);
    expect(pub.scope).toBeUndefined();
  });

  it("Menu upload: ops_agent may insert menu_documents without aal2 (not an MFA-mandated role)", () => {
    const ops = expectation("ops_agent", "menu_documents", "insert");
    expect(ops.outcome).toBe("allow");
    expect(ops.aal2Required).toBe(false);
  });

  it("Photos: ops_agent uploads but cannot moderate (no media update)", () => {
    expect(expectation("ops_agent", "media", "insert").outcome).toBe("allow");
    expect(expectation("ops_agent", "media", "update").outcome).toBe("deny-rls");
    expect(expectation("editor", "media", "update").outcome).toBe("allow");
  });

  it("Taxonomy: publisher+ only; editor and ops denied", () => {
    expect(expectation("publisher", "categories", "insert").outcome).toBe("allow");
    expect(expectation("editor", "categories", "insert").outcome).toBe("deny-rls");
    expect(expectation("ops_agent", "categories", "update").outcome).toBe("deny-rls");
  });

  it("Role management: super_admin only, @aal2", () => {
    const sa = expectation("super_admin", "user_roles", "insert");
    expect(sa.outcome).toBe("allow");
    expect(sa.aal2Required).toBe(true);
    expect(expectation("publisher", "user_roles", "insert").outcome).toBe("deny-rls");
  });

  it("Audit log: publisher reads all; editor/reviewer/ops own scope; nobody writes", () => {
    expect(expectation("publisher", "audit_log", "select").scope).toBeUndefined();
    expect(expectation("editor", "audit_log", "select").scope).toEqual({
      kind: "ownRows",
      actorColumn: "actor",
    });
    for (const role of ["super_admin", "publisher", "editor", "ops_agent"]) {
      expect(expectation(role, "audit_log", "insert").outcome).toBe("deny-grant");
    }
  });

  it("masked roles (vendor_owner, vendor_manager, contributor) have zero allows anywhere", () => {
    const allows = model.expectations.filter(
      (e) =>
        ["vendor_owner", "vendor_manager", "contributor"].includes(e.role) &&
        e.outcome === "allow",
    );
    expect(allows).toEqual([]);
  });

  it("every live staff role can read content tables; nobody reads events (not live)", () => {
    expect(expectation("language_reviewer_ja", "listings", "select").outcome).toBe("allow");
    expect(expectation("ops_agent", "provenance", "select").outcome).toBe("allow");
    expect(model.expectations.some((e) => e.table === "events")).toBe(false);
  });
});

describe("grants", () => {
  it("audit_log regains exactly select for authenticated", () => {
    const g = model.grants.find((g) => g.table === "audit_log");
    expect(g).toBeDefined();
    expect(g!.ops).toEqual({ select: "full" });
  });

  it("protected tables get column-scoped INSERT and UPDATE (never full)", () => {
    for (const table of Object.keys(PROTECTED_COLUMNS)) {
      const g = model.grants.find((g) => g.table === table);
      if (!g) continue;
      for (const op of ["insert", "update"] as const) {
        if (g.ops[op]) expect(g.ops[op]).toBe("columns");
      }
    }
    const listings = model.grants.find((g) => g.table === "listings")!;
    expect(listings.ops.insert).toBe("columns");
    expect(listings.ops.update).toBe("columns");
  });

  it("provenance and menu_version_locales have no update/delete grant (fn-owned state)", () => {
    const prov = model.grants.find((g) => g.table === "provenance")!;
    expect(prov.ops.update).toBeUndefined();
    expect(prov.ops.delete).toBeUndefined();
    const mvl = model.grants.find((g) => g.table === "menu_version_locales")!;
    expect(mvl.ops.update).toBeUndefined();
    expect(mvl.ops.delete).toBeUndefined();
    expect(mvl.ops.insert).toBe("columns");
  });

  it("every live table has a grant spec; no grant spec exists for non-live tables", () => {
    expect(model.grants.map((g) => g.table).sort()).toEqual([...LIVE_TABLES].sort());
  });
});

describe("aal2 composition", () => {
  it("every write conjunct whose roles are all MFA-mandated carries aal2", () => {
    for (const p of model.policies) {
      if (p.op === "select") continue;
      for (const c of p.conjuncts) {
        const allMfa = c.roles.every((r) =>
          ["super_admin", "publisher", "editor"].includes(r),
        );
        if (allMfa) expect(c.aal2, `${p.name}: ${c.roles.join(",")}`).toBe(true);
      }
    }
  });

  it("no WRITE conjunct mixes MFA-mandated and non-mandated roles (reads are shared staff surface)", () => {
    for (const p of model.policies) {
      if (p.op === "select") continue;
      for (const c of p.conjuncts) {
        const mfa = c.roles.filter((r) => ["super_admin", "publisher", "editor"].includes(r));
        expect(
          mfa.length === 0 || mfa.length === c.roles.length,
          `${p.name} mixes ${c.roles.join(",")}`,
        ).toBe(true);
      }
    }
  });
});
