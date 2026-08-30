import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { fetchCategories } from "@/lib/taxonomy/read";
import { buildCategoryTree, type CategoryNode } from "@/lib/taxonomy/tree";
import { listViewState } from "@/lib/view-state";
import { LOCALES } from "@/lib/locales";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Content structure</p>
        <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Taxonomy</h1>
        <p className="mt-4 text-base leading-7 text-secondary">
          Organize discovery categories and monitor label completeness across supported locales.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <section aria-labelledby="categories-heading" className="min-w-0 rounded-card border border-hairline-strong bg-white p-5 shadow-card sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="categories-heading" className="text-xl font-bold text-ink">Categories</h2>
            <p className="mt-1 text-sm text-secondary">Parent and child categories in public display order.</p>
          </div>
          {state.kind === "ok" ? <Badge variant="neutral">{state.data.length} total</Badge> : null}
        </div>
        {state.kind === "error" ? (
          <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">Couldn&apos;t load categories: {state.message}</p>
        ) : null}
        {state.kind === "empty" ? (
          <div className="rounded-field border border-dashed border-hairline-strong bg-field p-6 text-center text-sm text-secondary">
            No categories yet. Create the first one to begin the discovery hierarchy.
          </div>
        ) : null}
        {state.kind === "ok" ? <CategoryTree nodes={buildCategoryTree(state.data)} /> : null}
      </section>
        <aside className="lg:sticky lg:top-6">
          <NewCategoryForm parents={parents} />
        </aside>
      </div>
    </div>
  );
}

function CategoryTree({ nodes, nested = false }: { nodes: CategoryNode[]; nested?: boolean }) {
  return (
    <ul className={nested ? "ml-4 space-y-3 border-l border-hairline-strong pl-4 sm:ml-6" : "space-y-3"}>
      {nodes.map((n) => (
        <li key={n.id} className="space-y-3">
          <article className="rounded-field border border-hairline bg-shell p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-ink">{n.localesByCode.en?.label ?? "No English label"}</h3>
                <div aria-label="locale completeness" className="mt-2 flex flex-wrap gap-1.5">
                  {LOCALES.map((locale) => (
                    <Badge key={locale} variant={n.localesByCode[locale] ? "verified" : "stale"}>
                      {locale.toUpperCase()} {n.localesByCode[locale] ? "Complete" : "Missing"}
                    </Badge>
                  ))}
                  {!n.active ? <Badge variant="error">Inactive</Badge> : null}
                  {!n.publicly_visible ? <Badge variant="neutral">Hidden</Badge> : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/taxonomy/${n.id}`} className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
                  Edit
                </Link>
                <ActiveToggle id={n.id} active={n.active} />
              </div>
            </div>
          </article>
          {n.children.length > 0 ? <CategoryTree nodes={n.children} nested /> : null}
        </li>
      ))}
    </ul>
  );
}
