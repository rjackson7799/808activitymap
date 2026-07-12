import { LOCALES, type Locale } from "@/lib/locales";

/**
 * Pure taxonomy shaping (CP3) — types + tree builder, no I/O and no
 * `server-only` marker so it is unit-testable in node. `read.ts` (server-only)
 * fetches rows and hands them here.
 */

export interface CategoryLocaleRow {
  locale: string;
  label: string;
  slug: string;
}

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  sort: number;
  active: boolean;
  publicly_visible: boolean;
  category_locales: CategoryLocaleRow[];
}

export interface CategoryNode extends CategoryRow {
  children: CategoryNode[];
  /** locale → row, for quick per-locale rendering + completeness checks. */
  localesByCode: Partial<Record<Locale, CategoryLocaleRow>>;
  /** locales still missing a label+slug (drives the completeness chips). */
  missingLocales: Locale[];
}

/**
 * Build a roots→children tree, each node ordered by `sort`, with per-locale
 * completeness. Orphans (unknown parent) are surfaced as roots so nothing
 * silently disappears from the admin view.
 */
export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const bySort = (a: { sort: number }, b: { sort: number }) => a.sort - b.sort;
  const nodes = new Map<string, CategoryNode>();

  for (const row of rows) {
    const localesByCode: Partial<Record<Locale, CategoryLocaleRow>> = {};
    for (const cl of row.category_locales ?? []) {
      if ((LOCALES as readonly string[]).includes(cl.locale) && cl.label && cl.slug) {
        localesByCode[cl.locale as Locale] = cl;
      }
    }
    const missingLocales = LOCALES.filter((l) => !localesByCode[l]);
    nodes.set(row.id, { ...row, children: [], localesByCode, missingLocales });
  }

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  for (const node of nodes.values()) node.children.sort(bySort);
  return roots.sort(bySort);
}
