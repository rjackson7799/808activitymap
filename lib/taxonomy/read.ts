import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryRow } from "./tree";

/**
 * Taxonomy read model (CP3) — staff-side. Runs through the RLS-bound server
 * client (staff SELECT policy on categories/category_locales); anon never
 * reaches this. Pure shaping lives in ./tree so it can be unit-tested.
 */

export async function fetchCategories(
  supabase: SupabaseClient,
): Promise<{ data: CategoryRow[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, parent_id, sort, active, publicly_visible, category_locales(locale, label, slug)")
    .order("sort", { ascending: true });
  return { data: (data as CategoryRow[] | null) ?? null, error };
}

export async function fetchCategory(
  supabase: SupabaseClient,
  id: string,
): Promise<{ data: CategoryRow | null; error: unknown }> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, parent_id, sort, active, publicly_visible, category_locales(locale, label, slug)")
    .eq("id", id)
    .maybeSingle();
  return { data: (data as CategoryRow | null) ?? null, error };
}
