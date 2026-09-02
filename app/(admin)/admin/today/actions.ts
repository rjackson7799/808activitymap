"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import type { Role } from "@/db/rls/matrix";
import { AuthzError } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { mapAuthzError, mapDbError } from "@/lib/errors";
import { TAG_PUBLIC, TAG_SITEMAP, TAG_TODAY } from "@/lib/public-read/tags";

export interface TodayActionState { ok?: boolean; error?: string; code?: string }

async function authorize(roles: readonly Role[]) {
  try { await requireRole(roles, { aal2: true }); return null; }
  catch (error) {
    if (error instanceof AuthzError) return mapAuthzError(error);
    throw error;
  }
}

function result(error: unknown): TodayActionState {
  const mapped = mapDbError(error);
  return { error: mapped.message, code: mapped.code };
}

function refreshAdmin() { revalidatePath("/admin/today"); }
function refreshPublic() {
  updateTag(TAG_TODAY);
  updateTag(TAG_SITEMAP);
  updateTag(TAG_PUBLIC);
}

export async function createEdition(_previous: TodayActionState, formData: FormData): Promise<TodayActionState> {
  const denied = await authorize(["super_admin", "publisher", "editor"]);
  if (denied) return { error: denied.message, code: denied.code };
  const parsed = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(formData.get("week_of"));
  if (!parsed.success) return { error: "Choose the Monday that starts this edition week." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("create_today_edition", { p_week_of: parsed.data });
  if (error) return result(error);
  refreshAdmin();
  return { ok: true };
}

export async function saveEditionLocale(_previous: TodayActionState, formData: FormData): Promise<TodayActionState> {
  const denied = await authorize(["super_admin", "publisher", "editor", "language_reviewer_ja", "language_reviewer_ko"]);
  if (denied) return { error: denied.message, code: denied.code };
  const parsed = z.object({
    edition_id: z.uuid(), locale: z.enum(["en", "ja", "ko"]),
    title: z.string().trim().min(2).max(120),
    dek: z.string().trim().min(3).max(280),
    body: z.string().trim().min(20).max(5000),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Enter a headline, short introduction, and editorial note of at least 20 characters." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("save_today_edition_locale", {
    p_edition_id: parsed.data.edition_id, p_locale: parsed.data.locale,
    p_title: parsed.data.title, p_dek: parsed.data.dek, p_body: parsed.data.body,
  });
  if (error) return result(error);
  refreshAdmin();
  return { ok: true };
}

export async function reviewEditionLocale(_previous: TodayActionState, formData: FormData): Promise<TodayActionState> {
  const denied = await authorize(["super_admin", "publisher", "editor", "language_reviewer_ja", "language_reviewer_ko"]);
  if (denied) return { error: denied.message, code: denied.code };
  const parsed = z.object({ id: z.uuid(), approved: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "That localized edition is no longer available." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("review_today_edition_locale", { p_locale_id: parsed.data.id, p_approved: parsed.data.approved === "true" });
  if (error) return result(error);
  refreshAdmin();
  return { ok: true };
}

export async function saveEditionItems(_previous: TodayActionState, formData: FormData): Promise<TodayActionState> {
  const denied = await authorize(["super_admin", "publisher", "editor"]);
  if (denied) return { error: denied.message, code: denied.code };
  const editionId = z.uuid().safeParse(formData.get("edition_id"));
  const listingIds = z.array(z.uuid()).min(1).max(6).safeParse(formData.getAll("listing_ids"));
  if (!editionId.success || !listingIds.success) return { error: "Choose between one and six shortlist listings." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("set_today_edition_items", { p_edition_id: editionId.data, p_listing_ids: listingIds.data });
  if (error) return result(error);
  refreshAdmin();
  return { ok: true };
}

export async function publishEdition(_previous: TodayActionState, formData: FormData): Promise<TodayActionState> {
  const denied = await authorize(["super_admin", "publisher"]);
  if (denied) return { error: denied.message, code: denied.code };
  const id = z.uuid().safeParse(formData.get("edition_id"));
  if (!id.success) return { error: "That edition is no longer available." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("publish_today_edition", { p_edition_id: id.data });
  if (error) return result(error);
  refreshAdmin(); refreshPublic();
  return { ok: true };
}
export async function archiveEdition(_previous: TodayActionState, formData: FormData): Promise<TodayActionState> {
  const denied = await authorize(["super_admin", "publisher"]);
  if (denied) return { error: denied.message, code: denied.code };
  const id = z.uuid().safeParse(formData.get("edition_id"));
  if (!id.success) return { error: "That edition is no longer available." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("archive_today_edition", { p_edition_id: id.data });
  if (error) return result(error);
  refreshAdmin(); refreshPublic();
  return { ok: true };
}
