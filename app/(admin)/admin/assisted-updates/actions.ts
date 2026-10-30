"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthzError } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { ASSISTED_UPDATE_STAFF_ROLES } from "@/lib/assisted-updates/admin";
import { mapAuthzError, mapDbError } from "@/lib/errors";

const intakeSchema = z.object({
  listing_id: z.uuid(),
  channel: z.enum(["email", "sms"]),
  locale: z.enum(["en", "ja"]),
  from_address: z.string().trim().min(3).max(320),
  body: z.string().trim().min(10).max(5000),
  field: z.enum(["name", "address", "phone", "hours", "menu", "closure", "other"]),
  details: z.string().trim().min(10).max(2000),
  received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});

const responseSchema = z.object({
  message_id: z.uuid(),
  response_note: z.string().trim().min(3).max(2000),
});

export interface AssistedUpdateActionState {
  ok?: boolean;
  error?: string;
  code?: string;
}

async function authorize(): Promise<{ ok: true } | { ok: false; denied: { message: string; code: string } }> {
  try {
    await requireRole(ASSISTED_UPDATE_STAFF_ROLES, { aal2: true });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, denied: mapAuthzError(error) };
    throw error;
  }
}

export async function recordAssistedUpdate(
  _previous: AssistedUpdateActionState,
  formData: FormData,
): Promise<AssistedUpdateActionState> {
  const auth = await authorize();
  if (!auth.ok) return { error: auth.denied.message, code: auth.denied.code };

  const parsed = intakeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "Complete every field. Message and correction details must be at least 10 characters." };
  }

  const receivedAt = new Date(`${parsed.data.received_at}:00-10:00`);
  if (Number.isNaN(receivedAt.getTime())) return { error: "Enter a valid received date and time." };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("record_assisted_update", {
    p_listing_id: parsed.data.listing_id,
    p_channel: parsed.data.channel,
    p_locale: parsed.data.locale,
    p_from_address: parsed.data.from_address,
    p_body: parsed.data.body,
    p_field: parsed.data.field,
    p_details: parsed.data.details,
    p_received_at: receivedAt.toISOString(),
  });
  if (error) {
    const mapped = mapDbError(error);
    return { error: mapped.message, code: mapped.code };
  }

  revalidatePath("/admin/assisted-updates");
  revalidatePath("/admin/change-requests");
  return { ok: true };
}

export async function recordAssistedResponse(
  _previous: AssistedUpdateActionState,
  formData: FormData,
): Promise<AssistedUpdateActionState> {
  const auth = await authorize();
  if (!auth.ok) return { error: auth.denied.message, code: auth.denied.code };

  const parsed = responseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Add a response note between 3 and 2,000 characters." };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("record_assisted_response", {
    p_message_id: parsed.data.message_id,
    p_response_note: parsed.data.response_note,
  });
  if (error) {
    const mapped = mapDbError(error);
    return { error: mapped.message, code: mapped.code };
  }

  revalidatePath("/admin/assisted-updates");
  return { ok: true };
}
