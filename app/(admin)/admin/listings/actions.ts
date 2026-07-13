"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { AuthzError } from "@/lib/auth/claims";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { mapAuthzError, mapDbError } from "@/lib/errors";
import { isLocale } from "@/lib/locales";
import { TAG_PUBLIC, TAG_SITEMAP, tagForListing } from "@/lib/public-read/tags";

/**
 * Publish/unpublish + QA + menu-approval server actions (CP3). Publication
 * state is fn-owned: every mutation goes ONLY through the guarded SECURITY
 * DEFINER fns via RPC (never a direct status write — those columns are
 * grant-protected). Each action self-guards with requireRole (publisher+/aal2)
 * AND the fn re-checks role/aal at the DB, so MFA follows the actor to any
 * path (ADR-001). RPCs run through the RLS-bound cookie client so the DB sees
 * the real actor (audit rows are attributed to auth.uid()).
 *
 * CP3 gates these to publisher+; reviewer/editor/ops workflows (own-locale QA,
 * external menu recording) arrive with their queues in later slices — the DB
 * fns already permit them.
 */

const PUBLISH_ROLES = ["super_admin", "publisher"] as const;

export interface ActionState {
  ok?: boolean;
  error?: string;
  code?: string;
}

async function denyIfUnauthorized(): Promise<ActionState | null> {
  try {
    await requireRole(PUBLISH_ROLES, { aal2: true });
    return null;
  } catch (e) {
    if (e instanceof AuthzError) return { error: mapAuthzError(e).message, code: e.reason };
    throw e;
  }
}

function revalidateListing(id: string) {
  revalidatePath("/admin/listings");
  revalidatePath(`/admin/listings/${id}`);
  // Public surface (CP4): invalidate the listing's own cached page/data, the sitemap, and
  // the category/home aggregates. updateTag (Next 16, Server-Action-only) purges the tag
  // on-demand with read-your-own-writes semantics, so the listing drops from the public
  // surface on unpublish and refreshes on publish — no stale-while-revalidate delay.
  updateTag(tagForListing(id));
  updateTag(TAG_SITEMAP);
  updateTag(TAG_PUBLIC);
}

export async function publishLocale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await denyIfUnauthorized();
  if (denied) return denied;

  const listing_id = String(formData.get("listing_id") ?? "");
  const locale = String(formData.get("locale") ?? "");
  if (!isLocale(locale)) return { error: "Unknown locale." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_listing_locale", {
    p_listing_id: listing_id,
    p_locale: locale,
  });
  if (error) {
    const m = mapDbError(error);
    return { error: m.message, code: m.code };
  }
  revalidateListing(listing_id);
  return { ok: true };
}

export async function unpublishLocale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await denyIfUnauthorized();
  if (denied) return denied;

  const listing_id = String(formData.get("listing_id") ?? "");
  const locale = String(formData.get("locale") ?? "");
  const reason = String(formData.get("reason") ?? "") || null;
  if (!isLocale(locale)) return { error: "Unknown locale." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("unpublish_listing_locale", {
    p_listing_id: listing_id,
    p_locale: locale,
    p_reason: reason,
  });
  if (error) {
    const m = mapDbError(error);
    return { error: m.message, code: m.code };
  }
  revalidateListing(listing_id);
  return { ok: true };
}

export async function transitionListingLocale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await denyIfUnauthorized();
  if (denied) return denied;

  const listing_id = String(formData.get("listing_id") ?? "");
  const locale = String(formData.get("locale") ?? "");
  const to_status = String(formData.get("to_status") ?? "");
  if (!isLocale(locale)) return { error: "Unknown locale." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("transition_listing_locale", {
    p_listing_id: listing_id,
    p_locale: locale,
    p_to_status: to_status,
  });
  if (error) {
    const m = mapDbError(error);
    return { error: m.message, code: m.code };
  }
  revalidateListing(listing_id);
  return { ok: true };
}

/**
 * Record an off-platform written vendor approval of a menu locale (D1). Staff
 * may only record `vendor_approved_external` and MUST attach the evidence
 * document — omitting it makes the guarded fn's evidence constraint raise
 * `menu_evidence_missing`, which we surface verbatim in the mapped message.
 */
export async function recordMenuApproval(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await denyIfUnauthorized();
  if (denied) return denied;

  const listing_id = String(formData.get("listing_id") ?? "");
  const mvl_id = String(formData.get("mvl_id") ?? "");
  const evidenceRaw = String(formData.get("evidence_media_id") ?? "").trim();
  const evidence_media_id = evidenceRaw === "" ? null : evidenceRaw;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("transition_menu_version_locale", {
    p_id: mvl_id,
    p_to_status: "approved",
    p_approval_type: "vendor_approved_external",
    p_evidence_media_id: evidence_media_id,
  });
  if (error) {
    const m = mapDbError(error);
    return { error: m.message, code: m.code };
  }
  revalidateListing(listing_id);
  return { ok: true };
}

export async function publishMenuLocale(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await denyIfUnauthorized();
  if (denied) return denied;

  const listing_id = String(formData.get("listing_id") ?? "");
  const mvl_id = String(formData.get("mvl_id") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("transition_menu_version_locale", {
    p_id: mvl_id,
    p_to_status: "published",
  });
  if (error) {
    const m = mapDbError(error);
    return { error: m.message, code: m.code };
  }
  revalidateListing(listing_id);
  return { ok: true };
}
