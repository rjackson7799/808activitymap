import { describe, expect, it } from "vitest";
import { buildCategoryTree, type CategoryRow } from "@/lib/taxonomy/tree";

const row = (over: Partial<CategoryRow> & { id: string }): CategoryRow => ({
  parent_id: null,
  sort: 0,
  active: true,
  publicly_visible: true,
  category_locales: [],
  ...over,
});

describe("buildCategoryTree", () => {
  it("nests children under parents and orders both levels by sort", () => {
    const rows = [
      row({ id: "dining", sort: 0 }),
      row({ id: "sushi", parent_id: "dining", sort: 1 }),
      row({ id: "ramen", parent_id: "dining", sort: 0 }),
      row({ id: "activities", sort: 1 }),
    ];
    const tree = buildCategoryTree(rows);
    expect(tree.map((n) => n.id)).toEqual(["dining", "activities"]);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["ramen", "sushi"]);
  });

  it("computes per-locale completeness (missingLocales) from label+slug presence", () => {
    const tree = buildCategoryTree([
      row({
        id: "ramen",
        category_locales: [
          { locale: "en", label: "Ramen", slug: "ramen" },
          { locale: "ja", label: "ラーメン", slug: "ラーメン" },
          { locale: "ko", label: "", slug: "" }, // incomplete → still missing
        ],
      }),
    ]);
    expect(tree[0]!.localesByCode.en?.slug).toBe("ramen");
    expect(tree[0]!.missingLocales).toEqual(["ko"]);
  });

  it("surfaces an orphan (unknown parent) as a root so it never disappears", () => {
    const tree = buildCategoryTree([row({ id: "lost", parent_id: "ghost" })]);
    expect(tree.map((n) => n.id)).toEqual(["lost"]);
  });

  it("returns an empty array for no rows", () => {
    expect(buildCategoryTree([])).toEqual([]);
  });
});
