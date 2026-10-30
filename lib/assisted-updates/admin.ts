import type { Role } from "@/db/rls/matrix";

/** Phase 0 manual email/SMS intake; this does not authorize provider integration. */
export const ASSISTED_UPDATE_STAFF_ROLES: readonly Role[] = [
  "super_admin",
  "publisher",
  "editor",
  "ops_agent",
];

export function canManageAssistedUpdates(roles: readonly Role[]): boolean {
  return roles.some((role) => ASSISTED_UPDATE_STAFF_ROLES.includes(role));
}
