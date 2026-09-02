import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sortQaQueue, type ListingTranslation, type QaAssignmentView, type QaLocale, type QaQueueItem } from "./admin";

const translation = (row: Record<string, unknown>): ListingTranslation => ({
  name: row.name as string | null,
  slug: row.slug as string | null,
  seoTitle: row.seo_title as string | null,
  seoDescription: row.seo_desc as string | null,
  editorialNote: row.editorial_note as string | null,
});

export async function fetchLanguageQaQueue(
  supabase: SupabaseClient,
  locale: QaLocale,
): Promise<{ items: QaQueueItem[]; error: Error | null }> {
  const [localeResult, menuResult, assignmentResult, sessionResult] = await Promise.all([
    supabase.from("listing_locales").select("id,listing_id,locale,status,name,slug,seo_title,seo_desc,editorial_note,updated_at").eq("locale", locale).eq("status", "qa_pending"),
    supabase.from("menu_version_locales").select("id,locale,status,updated_at,menu_versions!inner(id,version,menu_documents!inner(listing_id,source_media_id,media!menu_documents_source_media_id_fkey(bucket,path)))").eq("locale", locale).eq("status", "qa_pending"),
    supabase.from("qa_assignments").select("id,target_type,target_id,assigned_to,assigned_at,completed_at"),
    supabase.from("qa_work_sessions").select("id,assignment_id,actor,started_at,ended_at,active_minutes"),
  ]);
  const firstError = localeResult.error ?? menuResult.error ?? assignmentResult.error ?? sessionResult.error;
  if (firstError) return { items: [], error: new Error(firstError.message) };

  const listingRows = (localeResult.data ?? []) as Array<Record<string, unknown>>;
  const menuRows = (menuResult.data ?? []) as Array<Record<string, unknown>>;
  const listingIds = [...new Set([
    ...listingRows.map((row) => row.listing_id as string),
    ...menuRows.map((row) => ((row.menu_versions as Record<string, unknown>).menu_documents as Record<string, unknown>).listing_id as string),
  ])];
  const [namesResult, sourceLocalesResult] = await Promise.all([
    listingIds.length ? supabase.from("listing_locales").select("listing_id,locale,name").in("listing_id", listingIds) : Promise.resolve({ data: [], error: null }),
    listingIds.length ? supabase.from("listing_locales").select("listing_id,locale,name,slug,seo_title,seo_desc,editorial_note").in("listing_id", listingIds).eq("locale", "en") : Promise.resolve({ data: [], error: null }),
  ]);
  if (namesResult.error || sourceLocalesResult.error) return { items: [], error: new Error((namesResult.error ?? sourceLocalesResult.error)!.message) };
  const allNames = (namesResult.data ?? []) as Array<{ listing_id: string; locale: string; name: string | null }>;
  const listingName = (id: string) => allNames.find((row) => row.listing_id === id && row.locale === "en")?.name ?? allNames.find((row) => row.listing_id === id)?.name ?? "Untitled listing";
  const sourceByListing = new Map((sourceLocalesResult.data ?? []).map((row) => [(row as { listing_id: string }).listing_id, translation(row as Record<string, unknown>)]));

  const sessions = (sessionResult.data ?? []) as Array<{ id: string; assignment_id: string; actor: string; ended_at: string | null; active_minutes: number | null }>;
  const assignmentByTarget = new Map<string, QaAssignmentView>();
  for (const row of (assignmentResult.data ?? []) as Array<{ id: string; target_type: string; target_id: string; assigned_to: string; assigned_at: string; completed_at: string | null }>) {
    const related = sessions.filter((session) => session.assignment_id === row.id);
    const active = related.find((session) => session.ended_at === null);
    assignmentByTarget.set(`${row.target_type}:${row.target_id}`, {
      id: row.id, assignedTo: row.assigned_to, assignedAt: row.assigned_at, completedAt: row.completed_at,
      activeSessionId: active?.id ?? null, activeActor: active?.actor ?? null,
      activeMinutes: related.reduce((sum, session) => sum + Number(session.active_minutes ?? 0), 0),
    });
  }

  const items: QaQueueItem[] = listingRows.map((row) => ({
    id: row.id as string, type: "listing_locale", listingId: row.listing_id as string,
    listingName: listingName(row.listing_id as string), locale, status: row.status as string,
    updatedAt: row.updated_at as string, assignment: assignmentByTarget.get(`listing_locale:${row.id}`) ?? null,
    listing: { source: sourceByListing.get(row.listing_id as string) ?? null, translation: translation(row) },
  }));

  for (const row of menuRows) {
    const version = row.menu_versions as Record<string, unknown>;
    const document = version.menu_documents as Record<string, unknown>;
    const media = document.media as Record<string, unknown>;
    const versionId = version.id as string;
    const { data: sectionData, error: sectionError } = await supabase.from("menu_sections").select("id,position,menu_section_locales(locale,name),menu_items(id,position,price_cents,currency,price_type,menu_item_locales(locale,original_name,transliteration,name,description,extraction_confidence,human_confirmed))").eq("menu_version_id", versionId).order("position");
    if (sectionError) return { items: [], error: new Error(sectionError.message) };
    const signed = await supabase.storage.from(media.bucket as string).createSignedUrl(media.path as string, 3600);
    const sections = ((sectionData ?? []) as Array<Record<string, unknown>>).map((section) => {
      const labels = section.menu_section_locales as Array<{ locale: string; name: string }>;
      return {
        id: section.id as string, position: section.position as number,
        sourceName: labels.find((label) => label.locale === "en")?.name ?? null,
        name: labels.find((label) => label.locale === locale)?.name ?? null,
        items: ((section.menu_items ?? []) as Array<Record<string, unknown>>).map((menuItem) => {
          const labels = menuItem.menu_item_locales as Array<Record<string, unknown>>;
          const source = labels.find((label) => label.locale === "en");
          const target = labels.find((label) => label.locale === locale);
          return {
            id: menuItem.id as string, position: menuItem.position as number,
            priceCents: menuItem.price_cents as number | null, currency: menuItem.currency as string, priceType: menuItem.price_type as string,
            sourceName: source?.name as string | null ?? null, name: target?.name as string | null ?? null,
            originalName: target?.original_name as string | null ?? null, transliteration: target?.transliteration as string | null ?? null,
            description: target?.description as string | null ?? null, confidence: target?.extraction_confidence as number | null ?? null,
            humanConfirmed: Boolean(target?.human_confirmed),
          };
        }).sort((a, b) => a.position - b.position),
      };
    });
    const id = row.id as string;
    const listingId = document.listing_id as string;
    items.push({ id, type: "menu_locale", listingId, listingName: listingName(listingId), locale, status: row.status as string,
      updatedAt: row.updated_at as string, assignment: assignmentByTarget.get(`menu_locale:${id}`) ?? null,
      menu: { version: version.version as number, sourcePath: media.path as string, sourceUrl: signed.data?.signedUrl ?? null, sections },
    });
  }

  return { items: sortQaQueue(items), error: null };
}
