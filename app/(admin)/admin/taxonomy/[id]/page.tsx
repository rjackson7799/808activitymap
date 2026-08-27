import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthzError, STAFF_ROLES } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { fetchCategory } from "@/lib/taxonomy/read";
import { itemViewState } from "@/lib/view-state";
import { LOCALES } from "@/lib/locales";
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
      <>
        <p>
          <Link href="/admin/taxonomy">← Taxonomy</Link>
        </p>
        <h1>Category</h1>
        <p role="alert" style={{ color: "#b00020" }}>
          {state.notFound ? "That category doesn't exist." : `Couldn't load the category: ${state.message}`}
        </p>
      </>
    );
  }

  const category = state.data;
  const localeRow = (l: string) => category.category_locales.find((cl) => cl.locale === l);

  return (
    <>
      <p>
        <Link href="/admin/taxonomy">← Taxonomy</Link>
      </p>
      <h1>Edit category</h1>
      <p>
        Status: {category.active ? "active" : "inactive"}
        {category.publicly_visible ? "" : " · hidden"} <ActiveToggle id={category.id} active={category.active} />
      </p>

      <FlagsForm
        category={{
          id: category.id,
          parent_id: category.parent_id,
          sort: category.sort,
          publicly_visible: category.publicly_visible,
        }}
      />

      <section aria-label="Per-locale labels" style={{ marginTop: "1.5rem", display: "grid", gap: "1.25rem" }}>
        <h2>Labels &amp; slugs</h2>
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
      </section>
    </>
  );
}
