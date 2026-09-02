import type { Role } from "@/db/rls/matrix";

/** Phase 0 inquiry triage only; this does not authorize claim review. */
export const BUSINESS_INQUIRY_STAFF_ROLES: readonly Role[] = [
  "super_admin",
  "editor",
  "ops_agent",
];

export function canManageBusinessInquiries(roles: readonly Role[]): boolean {
  return roles.some((role) => BUSINESS_INQUIRY_STAFF_ROLES.includes(role));
}
