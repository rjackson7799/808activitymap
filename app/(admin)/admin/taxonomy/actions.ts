"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { AuthzError } from "@/lib/auth/claims";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { mapAuthzError, mapDbError } from "@/lib/errors";
import { isLocale } from "@/lib/locales";
import { validateCategorySlug } from "@/lib/taxonomy/slug";

/**
 * Taxonomy CRUD server actions (CP3). Every action SELF-guards with
 * `requireRole([...],{aal2:true})` — the admin layout guard is redirect
 * ergonomics only and never protects an action POST (ADR-001). Writes go
 * through the RLS-bound cookie client (the actor's JWT), so RLS + audit
 * triggers apply and the audit actor is the real user — never the service
 * client. All failures route through the shared error mapper so the "clean
 * surfaced validation error" (duplicate slug → slug field) is produced once.
 *
 * Handler posture is deliberately STRICTER than RLS: RLS additionally lets an
 * own-locale language_reviewer write category_locales, but taxonomy management
 * here is publisher+ only (PRD §4 "Taxonomy CRUD/merge"). See ADR-009 note.
 */

const TAXONOMY_ROLES = ["super_admin", "publisher"] as const;

export interface ActionState {
  ok?: boolean;
  error?: string;
  field?: string;
}

/** Returns an ActionState to surface, or null when the caller is authorized. */
async function denyIfUnauthorized(): Promise<ActionState | null> {
  try {
    await requireRole(TAXONOMY_ROLES, { aal2: true });
    return null;
  } catch (e) {
    if (e instanceof AuthzError) return { error: mapAuthzError(e).message };
    throw e;
  }
}

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await denyIfUnauthorized();
  if (denied) return denied;

  const label = String(formData.get("label") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "");
  const parentRaw = String(formData.get("parent_id") ?? "").trim();
  const parent_id = parentRaw === "" ? null : parentRaw;
  const sort = Number.parseInt(String(formData.get("sort") ?? "0"), 10) || 0;
  const publicly_visible = formData.get("publicly_visible") != null;

  if (label === "") return { error: "Enter a category label.", field: "label" };
  const slug = validateCategorySlug(rawSlug);
  if (!slug.ok) return { error: slug.reason, field: "slug" };

  const supabase = await createSupabaseServerClient();

  const { data: cat, error: catErr } = await supabase
    .from("categories")
    .insert({ parent_id, sort, publicly_visible })
    .select("id")
    .single();
  if (catErr || !cat) {
    const m = mapDbError(catErr);
    return { error: m.message, field: m.field };
  }

  const { error: locErr } = await supabase
    .from("category_locales")
    .insert({ category_id: cat.id, locale: "en", label, slug: slug.value });
  if (locErr) {
    // Compensate: remove the just-created shell so a retry with a fresh slug
    // starts clean (the two inserts can't be one statement without a migration;
    // the unique(locale,slug) collision is the intended failure here).
    await supabase.from("categories").delete().eq("id", cat.id);
    const m = mapDbError(locErr);
    return { error: m.message, field: m.field };
  }

  revalidatePath("/admin/taxonomy");
  return { ok: true };
}

export async function upsertCategoryLocale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await denyIfUnauthorized();
  if (denied) return denied;

  const category_id = String(formData.get("category_id") ?? "");
  const locale = String(formData.get("locale") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const rawSlug = String(formData.get("slug") ?? "");

  if (!isLocale(locale)) return { error: "Unknown locale." };
  if (label === "") return { error: "Enter a label.", field: "label" };
  const slug = validateCategorySlug(rawSlug);
  if (!slug.ok) return { error: slug.reason, field: "slug" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("category_locales")
    .upsert({ category_id, locale, label, slug: slug.value }, { onConflict: "category_id,locale" });
  if (error) {
    const m = mapDbError(error);
    return { error: m.message, field: m.field };
  }

  revalidatePath("/admin/taxonomy");
  revalidatePath(`/admin/taxonomy/${category_id}`);
  return { ok: true };
}

export async function updateCategoryFlags(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await denyIfUnauthorized();
  if (denied) return denied;

  const category_id = String(formData.get("category_id") ?? "");
  const parentRaw = String(formData.get("parent_id") ?? "").trim();
  const parent_id = parentRaw === "" ? null : parentRaw;
  const sort = Number.parseInt(String(formData.get("sort") ?? "0"), 10) || 0;
  const publicly_visible = formData.get("publicly_visible") != null;

  if (parent_id === category_id) return { error: "A category can't be its own parent." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("categories")
    .update({ parent_id, sort, publicly_visible })
    .eq("id", category_id);
  if (error) {
    const m = mapDbError(error);
    return { error: m.message, field: m.field };
  }

  revalidatePath("/admin/taxonomy");
  revalidatePath(`/admin/taxonomy/${category_id}`);
  return { ok: true };
}

/**
 * Activate/deactivate a category. Deactivating a category that is the primary
 * category of a PUBLISHED listing would leave that listing failing
 * category_integrity at publish time (surfaces on the public surface in CP4),
 * so we refuse with a clear message instead of silently creating that state.
 */
export async function setCategoryActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await denyIfUnauthorized();
  if (denied) return denied;

  const category_id = String(formData.get("category_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const supabase = await createSupabaseServerClient();

  if (!active) {
    const { data: inUse, error: useErr } = await supabase
      .from("listings")
      .select("id")
      .eq("primary_category_id", category_id)
      .eq("publication_status", "published")
      .limit(1);
    if (useErr) {
      const m = mapDbError(useErr);
      return { error: m.message };
    }
    if (inUse && inUse.length > 0) {
      return {
        error: "This category is the primary category of a published listing. Reassign those listings before deactivating.",
      };
    }
  }

  const { error } = await supabase.from("categories").update({ active }).eq("id", category_id);
  if (error) {
    const m = mapDbError(error);
    return { error: m.message };
  }

  revalidatePath("/admin/taxonomy");
  revalidatePath(`/admin/taxonomy/${category_id}`);
  return { ok: true };
}
