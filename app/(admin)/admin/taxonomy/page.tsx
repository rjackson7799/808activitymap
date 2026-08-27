import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { fetchCategories } from "@/lib/taxonomy/read";
import { buildCategoryTree, type CategoryNode } from "@/lib/taxonomy/tree";
import { listViewState } from "@/lib/view-state";
import { LOCALES } from "@/lib/locales";
import { NewCategoryForm, ActiveToggle } from "./CategoryForms";

/**
 * Taxonomy list (CP3): tree of categories with per-locale completeness, plus
 * create + activate/deactivate. Distinct empty AND error states (TSD P1-2) are
 * decided by the pure `listViewState` selector. Publisher+ / aal2 only.
 */
export default async function TaxonomyPage() {
  try {
    await requireRole(STAFF_ROLES, { aal2: true });
  } catch (e) {
    if (e instanceof AuthzError) redirect(e.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw e;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await fetchCategories(supabase);
  const state = listViewState(data, error);

  const parents =
    state.kind === "ok"
      ? state.data.map((c) => ({
          id: c.id,
          label: c.category_locales.find((l) => l.locale === "en")?.label ?? c.id,
        }))
      : [];

  return (
    <>
      <h1>Taxonomy</h1>
      <NewCategoryForm parents={parents} />
      <section aria-label="Categories" style={{ marginTop: "1.5rem" }}>
        <h2>Categories</h2>
        {state.kind === "error" ? (
          <p role="alert" style={{ color: "#b00020" }}>Couldn&apos;t load categories: {state.message}</p>
        ) : null}
        {state.kind === "empty" ? (
          <p>No categories yet. Create the first one above.</p>
        ) : null}
        {state.kind === "ok" ? <CategoryTree nodes={buildCategoryTree(state.data)} /> : null}
      </section>
    </>
  );
}

function CategoryTree({ nodes }: { nodes: CategoryNode[] }) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={n.id} style={{ marginBottom: "0.4rem" }}>
          <span>{n.localesByCode.en?.label ?? "(no English label)"}</span>{" "}
          <span aria-label="locale completeness">
            {LOCALES.map((l) => (
              <span
                key={l}
                title={n.localesByCode[l] ? `${l}: complete` : `${l}: missing`}
                style={{ marginRight: "0.3rem", color: n.localesByCode[l] ? "#166534" : "#92400e" }}
              >
                {l}:{n.localesByCode[l] ? "✓" : "–"}
              </span>
            ))}
          </span>{" "}
          {n.active ? null : <span style={{ color: "#92400e" }}>(inactive)</span>}{" "}
          {n.publicly_visible ? null : <span style={{ color: "#92400e" }}>(hidden)</span>}{" "}
          <Link href={`/admin/taxonomy/${n.id}`}>Edit</Link>{" "}
          <ActiveToggle id={n.id} active={n.active} />
          {n.children.length > 0 ? <CategoryTree nodes={n.children} /> : null}
        </li>
      ))}
    </ul>
  );
}
