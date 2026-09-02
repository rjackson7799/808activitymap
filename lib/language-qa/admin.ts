import type { Role } from "@/db/rls/matrix";

export type QaLocale = "ja" | "ko";
export type QaTargetType = "listing_locale" | "menu_locale";

export const LANGUAGE_QA_ROLES: readonly Role[] = [
  "super_admin",
  "publisher",
  "language_reviewer_ja",
  "language_reviewer_ko",
];

export function canReviewLocale(roles: readonly Role[], locale: QaLocale) {
  return roles.some((role) =>
    role === "super_admin" || role === "publisher" || role === `language_reviewer_${locale}`,
  );
}

export interface QaAssignmentView {
  id: string;
  assignedTo: string;
  assignedAt: string;
  completedAt: string | null;
  activeSessionId: string | null;
  activeActor: string | null;
  activeMinutes: number;
}

export interface ListingTranslation {
  name: string | null;
  slug: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  editorialNote: string | null;
}

export interface MenuQaItem {
  id: string;
  position: number;
  priceCents: number | null;
  currency: string;
  priceType: string;
  sourceName: string | null;
  name: string | null;
  originalName: string | null;
  transliteration: string | null;
  description: string | null;
  confidence: number | null;
  humanConfirmed: boolean;
}

export interface MenuQaSection {
  id: string;
  position: number;
  sourceName: string | null;
  name: string | null;
  items: MenuQaItem[];
}

export interface QaQueueItem {
  id: string;
  type: QaTargetType;
  listingId: string;
  listingName: string;
  locale: QaLocale;
  status: string;
  updatedAt: string;
  assignment: QaAssignmentView | null;
  listing?: { source: ListingTranslation | null; translation: ListingTranslation };
  menu?: {
    version: number;
    sourcePath: string;
    sourceUrl: string | null;
    sections: MenuQaSection[];
  };
}

export function queueAgeHours(item: Pick<QaQueueItem, "updatedAt">, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(item.updatedAt).getTime()) / 3_600_000));
}

export function sortQaQueue(items: readonly QaQueueItem[]) {
  return [...items].sort((a, b) => {
    const aAssigned = a.assignment?.completedAt ? 2 : a.assignment ? 1 : 0;
    const bAssigned = b.assignment?.completedAt ? 2 : b.assignment ? 1 : 0;
    return aAssigned - bAssigned || new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });
}

export function summarizeQaQueue(items: readonly QaQueueItem[], slaHours: number, now: Date) {
  const pending = items.filter((item) => !item.assignment?.completedAt);
  return {
    pending: pending.length,
    unassigned: pending.filter((item) => !item.assignment).length,
    active: pending.filter((item) => item.assignment?.activeSessionId).length,
    overSla: pending.filter((item) => queueAgeHours(item, now) > slaHours).length,
    oldestHours: pending.reduce((max, item) => Math.max(max, queueAgeHours(item, now)), 0),
  };
}

