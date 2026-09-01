import "server-only";
import { createSupabaseServiceClient } from "@/lib/auth/server";
import type { BusinessInquiryInput } from "./schema";

export type BusinessInquiryInsertResult =
  | { ok: true; id: string }
  | { ok: false; reason: "market_not_found" | "insert_failed" };

export async function submitBusinessInquiry(
  input: BusinessInquiryInput,
): Promise<BusinessInquiryInsertResult> {
  const db = createSupabaseServiceClient();
  const { data: market, error: marketError } = await db
    .from("markets")
    .select("id")
    .eq("id", "oahu-waikiki")
    .maybeSingle();

  if (marketError || !market) return { ok: false, reason: "market_not_found" };

  const { data, error } = await db
    .from("business_inquiries")
    .insert({
      market_id: market.id,
      source_locale: input.locale,
      business_name: input.businessName,
      contact_name: input.contactName,
      email: input.email,
      phone: input.phone || null,
      website: input.companyWebsite || null,
      preferred_language: input.preferredLanguage,
      message: input.message,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, reason: "insert_failed" };
  return { ok: true, id: data.id as string };
}
