"use server";

import { revalidatePath } from "next/cache";
import { AuthzError } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { mapAuthzError, mapDbError } from "@/lib/errors";
import { canReviewLocale, LANGUAGE_QA_ROLES, type QaLocale, type QaTargetType } from "@/lib/language-qa/admin";

export interface QaActionState { ok?: boolean; error?: string; code?: string }

async function authorize(locale: string): Promise<QaActionState | null> {
  if (locale !== "ja" && locale !== "ko") return { error: "Unknown QA locale.", code: "invalid_locale" };
  try {
    const claims = await requireRole(LANGUAGE_QA_ROLES, { aal2: true });
    return canReviewLocale(claims.appRoles, locale) ? null : { error: "You can only review your assigned language.", code: "forbidden" };
  } catch (error) {
    if (error instanceof AuthzError) { const mapped = mapAuthzError(error); return { error: mapped.message, code: mapped.code }; }
    throw error;
  }
}

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const nullable = (form: FormData, key: string) => value(form, key) || null;
const refresh = (locale: string, listingId?: string) => {
  revalidatePath(`/admin/qa/${locale}`);
  revalidatePath("/admin");
  if (listingId) revalidatePath(`/admin/listings/${listingId}`);
};

async function qaRpc(form: FormData, fn: "claim_qa_item" | "start_qa_work" | "pause_qa_work") {
  const locale = value(form, "locale");
  const denied = await authorize(locale); if (denied) return denied;
  const targetType = value(form, "target_type") as QaTargetType;
  const targetId = value(form, "target_id");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, { p_type: targetType, p_id: targetId, p_locale: locale });
  if (error) { const mapped = mapDbError(error); return { error: mapped.message, code: mapped.code }; }
  refresh(locale); return { ok: true };
}

export async function claimQaItem(_state: QaActionState, form: FormData) { return qaRpc(form, "claim_qa_item"); }
export async function startQaWork(_state: QaActionState, form: FormData) { return qaRpc(form, "start_qa_work"); }
export async function pauseQaWork(_state: QaActionState, form: FormData) { return qaRpc(form, "pause_qa_work"); }

export async function decideQaItem(_state: QaActionState, form: FormData): Promise<QaActionState> {
  const locale = value(form, "locale"); const denied = await authorize(locale); if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_qa_item", {
    p_type: value(form, "target_type") as QaTargetType,
    p_id: value(form, "target_id"), p_locale: locale,
    p_outcome: value(form, "outcome"),
  });
  if (error) { const mapped = mapDbError(error); return { error: mapped.message, code: mapped.code }; }
  refresh(locale, value(form, "listing_id")); return { ok: true };
}

export async function saveListingTranslation(_state: QaActionState, form: FormData): Promise<QaActionState> {
  const locale = value(form, "locale") as QaLocale; const denied = await authorize(locale); if (denied) return denied;
  const id = value(form, "target_id");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("listing_locales").update({
    name: nullable(form, "name"), slug: nullable(form, "slug"), seo_title: nullable(form, "seo_title"),
    seo_desc: nullable(form, "seo_desc"), editorial_note: nullable(form, "editorial_note"),
  }).eq("id", id).eq("locale", locale).eq("status", "qa_pending");
  if (error) { const mapped = mapDbError(error); return { error: mapped.message, code: mapped.code }; }
  refresh(locale); return { ok: true };
}

export async function saveMenuSection(_state: QaActionState, form: FormData): Promise<QaActionState> {
  const locale = value(form, "locale") as QaLocale; const denied = await authorize(locale); if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("menu_section_locales").upsert({ section_id: value(form, "section_id"), locale, name: value(form, "name") }, { onConflict: "section_id,locale" });
  if (error) { const mapped = mapDbError(error); return { error: mapped.message, code: mapped.code }; }
  refresh(locale); return { ok: true };
}

export async function saveMenuItem(_state: QaActionState, form: FormData): Promise<QaActionState> {
  const locale = value(form, "locale") as QaLocale; const denied = await authorize(locale); if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("menu_item_locales").upsert({
    item_id: value(form, "item_id"), locale, original_name: nullable(form, "original_name"),
    transliteration: nullable(form, "transliteration"), name: nullable(form, "name"),
    description: nullable(form, "description"), human_confirmed: form.get("human_confirmed") === "on",
  }, { onConflict: "item_id,locale" });
  if (error) { const mapped = mapDbError(error); return { error: mapped.message, code: mapped.code }; }
  refresh(locale); return { ok: true };
}
