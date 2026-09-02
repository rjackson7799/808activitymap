"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { AuthzError } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { mapAuthzError, mapDbError } from "@/lib/errors";
import { TAG_PUBLIC, tagForListing } from "@/lib/public-read/tags";
import type { Role } from "@/db/rls/matrix";
import { validateAffiliateDestination } from "@/lib/affiliate/url";

export interface DealActionState { ok?: boolean; error?: string; code?: string }

const CREATOR_ROLES = ["super_admin", "publisher", "editor", "ops_agent"] as const;
const EDITOR_ROLES = ["super_admin", "publisher", "editor"] as const;

async function authorize(roles: readonly Role[]) {
  try {
    await requireRole(roles, { aal2: true });
    return null;
  } catch (error) {
    if (error instanceof AuthzError) return mapAuthzError(error);
    throw error;
  }
}

function hawaiiInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00-10:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function result(error: unknown): DealActionState {
  const mapped = mapDbError(error);
  return { error: mapped.message, code: mapped.code };
}

export async function createDeal(_previous: DealActionState, formData: FormData): Promise<DealActionState> {
  const denied = await authorize(CREATOR_ROLES);
  if (denied) return { error: denied.message, code: denied.code };
  const parsed = z.object({
    listing_id: z.uuid(),
    reveal_code: z.string().trim().min(1).max(120),
    starts_at: z.string(),
    expires_at: z.string(),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Choose a listing, enter a code, and provide valid Hawaii start and end times." };
  const startsAt = hawaiiInstant(parsed.data.starts_at);
  const expiresAt = hawaiiInstant(parsed.data.expires_at);
  if (!startsAt || !expiresAt || expiresAt <= startsAt) return { error: "The expiration must be later than the start time." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("create_deal", {
    p_listing_id: parsed.data.listing_id,
    p_reveal_code: parsed.data.reveal_code,
    p_starts_at: startsAt,
    p_expires_at: expiresAt,
    p_sponsor_label: formData.get("sponsor_label") === "on",
  });
  if (error) return result(error);
  revalidatePath("/admin/deals");
  return { ok: true };
}

export async function saveDealLocale(_previous: DealActionState, formData: FormData): Promise<DealActionState> {
  const denied = await authorize(EDITOR_ROLES);
  if (denied) return { error: denied.message, code: denied.code };
  const parsed = z.object({
    deal_id: z.uuid(), locale: z.enum(["en", "ja", "ko"]),
    title: z.string().trim().min(2).max(120), terms: z.string().trim().min(3).max(1000),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Enter a title (2–120 characters) and terms (3–1,000 characters)." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("save_deal_locale", {
    p_deal_id: parsed.data.deal_id, p_locale: parsed.data.locale,
    p_title: parsed.data.title, p_terms: parsed.data.terms,
  });
  if (error) return result(error);
  revalidatePath("/admin/deals");
  return { ok: true };
}

export async function reviewDealLocale(_previous: DealActionState, formData: FormData): Promise<DealActionState> {
  const denied = await authorize(["super_admin", "publisher", "editor", "language_reviewer_ja", "language_reviewer_ko"] as const);
  if (denied) return { error: denied.message, code: denied.code };
  const parsed = z.object({ id: z.uuid(), approved: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "That localized offer is no longer available." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("review_deal_locale", { p_deal_locale_id: parsed.data.id, p_approved: parsed.data.approved === "true" });
  if (error) return result(error);
  revalidatePath("/admin/deals");
  return { ok: true };
}

export async function activateDeal(_previous: DealActionState, formData: FormData): Promise<DealActionState> {
  const denied = await authorize(EDITOR_ROLES);
  if (denied) return { error: denied.message, code: denied.code };
  const parsed = z.object({ deal_id: z.uuid(), evidence_media_id: z.uuid() }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Select an approved permission document." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("activate_deal", { p_deal_id: parsed.data.deal_id, p_evidence_media_id: parsed.data.evidence_media_id });
  if (error) return result(error);
  revalidatePath("/admin/deals");
  updateTag(TAG_PUBLIC);
  return { ok: true };
}

export async function killDeal(_previous: DealActionState, formData: FormData): Promise<DealActionState> {
  const denied = await authorize(EDITOR_ROLES);
  if (denied) return { error: denied.message, code: denied.code };
  const id = z.uuid().safeParse(String(formData.get("deal_id") ?? ""));
  if (!id.success) return { error: "That offer is no longer available." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("kill_deal", { p_deal_id: id.data });
  if (error) return result(error);
  revalidatePath("/admin/deals");
  updateTag(TAG_PUBLIC);
  return { ok: true };
}

export async function createAffiliateLink(_previous: DealActionState, formData: FormData): Promise<DealActionState> {
  const denied = await authorize(EDITOR_ROLES);
  if (denied) return { error: denied.message, code: denied.code };
  const parsed = z.object({
    listing_id: z.uuid(),
    partner_key: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/),
    partner_name: z.string().trim().min(2).max(80),
    destination_url: z.string().trim().max(2000),
    context: z.enum(["nearby_activity", "reservation", "transportation", "other"]),
    sort_order: z.coerce.number().int().min(-1000).max(1000),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Choose a listing and enter valid partner details." };
  const destination = validateAffiliateDestination(parsed.data.destination_url);
  if (!destination.ok) return { error: destination.error };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("create_affiliate_link", {
    p_listing_id: parsed.data.listing_id,
    p_partner_key: parsed.data.partner_key,
    p_partner_name: parsed.data.partner_name,
    p_destination_url: destination.url.toString(),
    p_context: parsed.data.context,
    p_sort_order: parsed.data.sort_order,
  });
  if (error) return result(error);
  revalidatePath("/admin/deals");
  updateTag(tagForListing(parsed.data.listing_id));
  updateTag(TAG_PUBLIC);
  return { ok: true };
}

export async function setAffiliateLinkStatus(_previous: DealActionState, formData: FormData): Promise<DealActionState> {
  const denied = await authorize(EDITOR_ROLES);
  if (denied) return { error: denied.message, code: denied.code };
  const parsed = z.object({ id: z.uuid(), status: z.enum(["active", "hidden"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "That affiliate link is no longer available." };
  const db = await createSupabaseServerClient();
  const { data: listingId, error } = await db.rpc("set_affiliate_link_status", { p_link_id: parsed.data.id, p_status: parsed.data.status });
  if (error) return result(error);
  revalidatePath("/admin/deals");
  if (typeof listingId === "string") updateTag(tagForListing(listingId));
  updateTag(TAG_PUBLIC);
  return { ok: true };
}
