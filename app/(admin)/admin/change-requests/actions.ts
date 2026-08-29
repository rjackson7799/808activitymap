"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthzError } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { mapAuthzError, mapDbError } from "@/lib/errors";

const RESOLVER_ROLES = ["super_admin", "publisher", "editor"] as const;
const resolveSchema = z.object({
  request_id: z.uuid(),
  status: z.enum(["merged", "rejected", "overridden"]),
  resolution_note: z.string().trim().min(3).max(2000),
});

export interface CorrectionActionState { ok?: boolean; error?: string; code?: string }

async function authorize() {
  try {
    await requireRole(RESOLVER_ROLES, { aal2: true });
    return { ok: true } as const;
  } catch (error) {
    if (error instanceof AuthzError) return { ok: false, denied: mapAuthzError(error) } as const;
    throw error;
  }
}

export async function assignToMe(_prev: CorrectionActionState, formData: FormData): Promise<CorrectionActionState> {
  const auth = await authorize();
  if (!auth.ok) return { error: auth.denied.message, code: auth.denied.code };
  const requestId = z.uuid().safeParse(String(formData.get("request_id") ?? ""));
  if (!requestId.success) return { error: "Invalid correction request." };
  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("assign_change_request", { p_id: requestId.data });
  if (error) { const mapped = mapDbError(error); return { error: mapped.message, code: mapped.code }; }
  revalidatePath("/admin/change-requests");
  return { ok: true };
}

export async function resolveCorrection(_prev: CorrectionActionState, formData: FormData): Promise<CorrectionActionState> {
  const auth = await authorize();
  if (!auth.ok) return { error: auth.denied.message, code: auth.denied.code };
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Choose an outcome and add a resolution note (3–2,000 characters)." };
  const db = await createSupabaseServerClient();

  const { error } = await db.rpc("resolve_change_request", {
    p_id: parsed.data.request_id,
    p_status: parsed.data.status,
    p_resolution_note: parsed.data.resolution_note,
  });
  if (error) { const mapped = mapDbError(error); return { error: mapped.message, code: mapped.code }; }
  revalidatePath("/admin/change-requests");
  return { ok: true };
}
