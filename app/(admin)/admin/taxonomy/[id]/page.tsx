import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { fetchCategory } from "@/lib/taxonomy/read";
import { itemViewState } from "@/lib/view-state";
import { LOCALES } from "@/lib/locales";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ActiveToggle } from "../CategoryForms";
import { FlagsForm, LocaleForm } from "./EditForms";

/**
 * Category edit (CP3): structure flags + per-locale labels/slugs + active
 * toggle. Distinct error / not-found state via the pure `itemViewState`
 * selector. Publisher+ / aal2 only.
 */
export default async function CategoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(STAFF_ROLES, { aal2: true });
  } catch (e) {
    if (e instanceof AuthzError) redirect(e.reason === "aal2_required" ? "/login/mfa" : "/login");
    throw e;
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await fetchCategory(supabase, id);
  const state = itemViewState(data, error);

  if (state.kind === "error") {
    return (
      <div className="space-y-6">
        <Link href="/admin/taxonomy" className={buttonVariants({ variant: "outline", size: "sm" })}>← Taxonomy</Link>
        <h1 className="font-serif text-4xl text-ink">Category</h1>
        <p role="alert" className="rounded-field border border-error/20 bg-error-bg p-4 text-sm text-error">
          {state.notFound ? "That category doesn't exist." : `Couldn't load the category: ${state.message}`}
        </p>
      </div>
    );
  }

  const category = state.data;
  const localeRow = (l: string) => category.category_locales.find((cl) => cl.locale === l);

  return (
    <div className="space-y-8">
      <header>
        <Link href="/admin/taxonomy" className={buttonVariants({ variant: "outline", size: "sm" })}>← Taxonomy</Link>
        <p className="eyebrow mb-3 mt-6">Category details</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">Edit category</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={category.active ? "verified" : "error"}>{category.active ? "Active" : "Inactive"}</Badge>
              <Badge variant={category.publicly_visible ? "info" : "neutral"}>{category.publicly_visible ? "Public" : "Hidden"}</Badge>
            </div>
          </div>
          <ActiveToggle id={category.id} active={category.active} />
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <FlagsForm
          category={{
            id: category.id,
            parent_id: category.parent_id,
            sort: category.sort,
            publicly_visible: category.publicly_visible,
          }}
        />

      <section aria-labelledby="locale-labels-heading">
        <div className="mb-4">
          <h2 id="locale-labels-heading" className="text-xl font-bold text-ink">Labels and slugs</h2>
          <p className="mt-1 text-sm text-secondary">Maintain the public category name and URL for each locale.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
        {LOCALES.map((l) => {
          const row = localeRow(l);
          return (
            <LocaleForm
              key={l}
              categoryId={category.id}
              locale={l}
              label={row?.label ?? ""}
              slug={row?.slug ?? ""}
            />
          );
        })}
        </div>
      </section>
      </div>
    </div>
  );
}
