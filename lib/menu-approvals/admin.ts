import type { Role } from "@/db/rls/matrix";

/** Staff roles the guarded DB transition permits to record D1 evidence. */
export const MENU_APPROVAL_ROLES: readonly Role[] = [
  "super_admin",
  "publisher",
  "editor",
  "ops_agent",
];

export function canRecordExternalMenuApproval(roles: readonly Role[]): boolean {
  return roles.some((role) => MENU_APPROVAL_ROLES.includes(role));
}

export interface MenuApprovalQueueItem {
  id: string;
  listingId: string;
  listingName: string;
  locale: string;
  menuVersion: number;
  status: string;
  approvalType: string | null;
  evidenceMediaId: string | null;
  evidencePath: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const isPendingMenuApproval = (item: MenuApprovalQueueItem) =>
  item.status === "qa_approved" || item.status === "vendor_approval_pending";

export const hasApprovalIntegrityIssue = (item: MenuApprovalQueueItem) =>
  ["approved", "published"].includes(item.status) &&
  (!item.evidenceMediaId || !item.approvedBy || !item.approvedAt);

export function approvalAgeDays(item: MenuApprovalQueueItem, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(item.updatedAt).getTime()) / 86_400_000));
}

export function nextReminderDay(ageDays: number, reminderDays: readonly number[]): number | null {
  return [...reminderDays].sort((a, b) => a - b).find((day) => day > ageDays) ?? null;
}

export function sortMenuApprovalQueue(items: readonly MenuApprovalQueueItem[]): MenuApprovalQueueItem[] {
  return [...items].sort((a, b) => {
    const aPending = isPendingMenuApproval(a) ? 0 : 1;
    const bPending = isPendingMenuApproval(b) ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return aPending === 0
      ? new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function summarizeMenuApprovals(items: readonly MenuApprovalQueueItem[]) {
  return {
    pending: items.filter(isPendingMenuApproval).length,
    recorded: items.filter((item) => ["approved", "published"].includes(item.status)).length,
    published: items.filter((item) => item.status === "published").length,
    integrityIssues: items.filter(hasApprovalIntegrityIssue).length,
  };
}
