import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sortMenuApprovalQueue,
  type MenuApprovalQueueItem,
} from "@/lib/menu-approvals/admin";

export interface ApprovalEvidenceOption {
  id: string;
  path: string;
}

type RawMenuLocale = {
  id: string;
  locale: string;
  status: string;
  approval_type: string | null;
  approval_evidence_media_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  menu_versions: {
    version: number;
    menu_documents: { listing_id: string };
  };
};

type RawListing = {
  id: string;
  listing_locales: Array<{ locale: string; name: string | null }>;
};

export async function fetchMenuApprovalQueue(
  supabase: SupabaseClient,
): Promise<{ items: MenuApprovalQueueItem[]; evidence: ApprovalEvidenceOption[]; error: Error | null }> {
  const { data: localeData, error: localeError } = await supabase
    .from("menu_version_locales")
    .select(
      "id,locale,status,approval_type,approval_evidence_media_id,approved_by,approved_at,created_at,updated_at,menu_versions!inner(version,menu_documents!inner(listing_id))",
    );
  if (localeError) return { items: [], evidence: [], error: new Error(localeError.message) };

  const rawLocales = (localeData ?? []) as unknown as RawMenuLocale[];
  const listingIds = [...new Set(rawLocales.map((row) => row.menu_versions.menu_documents.listing_id))];
  const listingNames = new Map<string, string>();

  if (listingIds.length > 0) {
    const { data: listingData, error: listingError } = await supabase
      .from("listings")
      .select("id,listing_locales(locale,name)")
      .in("id", listingIds);
    if (listingError) return { items: [], evidence: [], error: new Error(listingError.message) };
    for (const listing of (listingData ?? []) as RawListing[]) {
      const locales = listing.listing_locales ?? [];
      listingNames.set(
        listing.id,
        locales.find((locale) => locale.locale === "en")?.name ??
          locales.find((locale) => locale.name)?.name ??
          "Untitled listing",
      );
    }
  }

  const { data: evidenceData, error: evidenceError } = await supabase
    .from("media")
    .select("id,path")
    .eq("kind", "evidence")
    .eq("moderation_status", "approved")
    .order("path", { ascending: true });
  if (evidenceError) return { items: [], evidence: [], error: new Error(evidenceError.message) };

  const evidence = (evidenceData ?? []) as ApprovalEvidenceOption[];
  const evidencePaths = new Map(evidence.map((item) => [item.id, item.path]));
  const items = rawLocales.map((row): MenuApprovalQueueItem => {
    const listingId = row.menu_versions.menu_documents.listing_id;
    return {
      id: row.id,
      listingId,
      listingName: listingNames.get(listingId) ?? "Untitled listing",
      locale: row.locale,
      menuVersion: row.menu_versions.version,
      status: row.status,
      approvalType: row.approval_type,
      evidenceMediaId: row.approval_evidence_media_id,
      evidencePath: row.approval_evidence_media_id ? evidencePaths.get(row.approval_evidence_media_id) ?? null : null,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  return { items: sortMenuApprovalQueue(items), evidence, error: null };
}
