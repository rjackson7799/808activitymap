"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { parseAdminConfigValue } from "@/config/admin-config";
import { AuthzError } from "@/lib/auth/claims";
import { requireRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { mapAuthzError, mapDbError } from "@/lib/errors";
import { TAG_PUBLIC, TAG_SITEMAP } from "@/lib/public-read/tags";

const updateSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(50_000),
});

export interface ConfigActionState {
  ok?: boolean;
  error?: string;
  code?: string;
}
export async function updateConfigValue(
  _previous: ConfigActionState,
  formData: FormData,
): Promise<ConfigActionState> {
  let claims;
  try {
    claims = await requireRole(["super_admin"], { aal2: true });
  } catch (error) {
    if (error instanceof AuthzError) {
      const mapped = mapAuthzError(error);
      return { error: mapped.message, code: mapped.code };
    }
    throw error;
  }

  const form = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!form.success) {
    return { error: "Choose a registered setting and provide a JSON value." };
  }

  const parsed = parseAdminConfigValue(form.data.key, form.data.value);
  if (!parsed.success) return { error: parsed.error, code: "invalid_config" };

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("app_config")
    .update({ value: parsed.value, updated_by: claims.sub })
    .eq("key", form.data.key)
    .select("key")
    .maybeSingle();

  if (error) {
    const mapped = mapDbError(error);
    return { error: mapped.message, code: mapped.code };
  }
  if (!data) {
    return { error: "That registered setting is missing from the database.", code: "missing_config" };
  }

  revalidatePath("/admin/config");
  updateTag(TAG_PUBLIC);
  updateTag(TAG_SITEMAP);
  return { ok: true };
}
