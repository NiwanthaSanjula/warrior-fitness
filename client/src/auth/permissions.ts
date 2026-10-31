// Wire type for the server-owned catalogue; auth APIs supply effective permissions.
export type Permission =
  | "members.read" | "members.create" | "members.update" | "members.status"
  | "plans.read" | "plans.manage"
  | "memberships.read" | "memberships.enroll" | "memberships.renew"
  | "invoices.read" | "invoices.create" | "payments.read" | "payments.record"
  | "attendance.read" | "attendance.check-in"
  | "attention.read" | "follow-ups.read" | "follow-ups.create"
  | "staff.manage" | "reports.read" | "settings.manage";

export function hasPermissions(
  staff: { role: string; permissions: readonly Permission[] } | null,
  ...permissions: Permission[]
): boolean {
  return staff !== null && (staff.role === "ADMIN" || permissions.every((permission) => staff.permissions?.includes(permission)));
}
