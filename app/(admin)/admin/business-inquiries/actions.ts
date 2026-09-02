"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthzError } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { BUSINESS_INQUIRY_STAFF_ROLES } from "@/lib/business-inquiries/admin";
import { mapAuthzError, mapDbError } from "@/lib/errors";

const transitionSchema = z.object({
  inquiry_id: z.uuid(),
  status: z.enum(["open", "contacted", "closed"]),
  staff_note: z.string().trim().min(3).max(2000),
});

export interface InquiryActionState {
  ok?: boolean;
  error?: string;
  code?: string;
}

export async function transitionInquiry(
  _previous: InquiryActionState,
  formData: FormData,
): Promise<InquiryActionState> {
  try {
    await requireRole(BUSINESS_INQUIRY_STAFF_ROLES, { aal2: true });
  } catch (error) {
    if (error instanceof AuthzError) {
      const mapped = mapAuthzError(error);
      return { error: mapped.message, code: mapped.code };
    }
    throw error;
  }

  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "Choose a new status and add an internal note (3–2,000 characters)." };
  }

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("transition_business_inquiry", {
    p_id: parsed.data.inquiry_id,
    p_status: parsed.data.status,
    p_staff_note: parsed.data.staff_note,
  });
  if (error) {
    const mapped = mapDbError(error);
    return { error: mapped.message, code: mapped.code };
  }

  revalidatePath("/admin/business-inquiries");
  return { ok: true };
}
