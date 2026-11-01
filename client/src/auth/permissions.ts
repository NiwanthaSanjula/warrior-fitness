// Wire type for the server-owned catalogue; auth APIs supply effective permissions.
export type Permission =
  | "members.read" | "members.create" | "members.update" | "members.status"
  | "plans.read" | "plans.manage"
  | "memberships.read" | "memberships.enroll" | "memberships.renew"
  | "invoices.read" | "invoices.create" | "payments.read" | "payments.record"
  | "attendance.read" | "attendance.check-in"
  | "attention.read" | "follow-ups.read" | "follow-ups.create"
  | "staff.manage" | "reports.read" | "settings.manage"
  | "expenses.manage" | "cash-closings.manage"
  | "equipment.read" | "equipment.report" | "equipment.manage"
  | "retail.read" | "retail.checkout" | "retail.sales.read" | "retail.manage";

export function hasPermissions(
  staff: { role: string; permissions: readonly Permission[] } | null,
  ...permissions: Permission[]
): boolean {
  return staff !== null && (staff.role === "ADMIN" || permissions.every((permission) => staff.permissions?.includes(permission)));
}

// Preserve the former Attendance check-in workflow for custom staff grants
// that do not include access to the full member directory.
export function canUseFrontDesk(staff: { role: string; permissions: readonly Permission[] } | null): boolean {
  return hasPermissions(staff, "members.read") || hasPermissions(staff, "attendance.read", "attendance.check-in", "memberships.read");
}
