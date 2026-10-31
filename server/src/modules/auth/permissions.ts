export const STAFF_ROLES = ["ADMIN", "RECEPTIONIST"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// The server owns role defaults. Clients consume effective permissions from auth APIs.
export const RECEPTIONIST_PERMISSIONS = [
  "members.read", "members.create", "members.update",
  "plans.read",
  "memberships.read", "memberships.enroll", "memberships.renew",
  "invoices.read", "invoices.create", "payments.read", "payments.record",
  "attendance.read", "attendance.check-in",
  "attention.read", "follow-ups.read", "follow-ups.create",
] as const;

export const ADMIN_ONLY_PERMISSIONS = [
  "members.status", "plans.manage", "staff.manage", "reports.read", "settings.manage",
] as const;

export const PERMISSIONS = [...RECEPTIONIST_PERMISSIONS, ...ADMIN_ONLY_PERMISSIONS] as const;
export type Permission = (typeof PERMISSIONS)[number];

export function effectivePermissions(staff: { role: StaffRole; permissions?: readonly string[] }): Permission[] {
  if (staff.role === "ADMIN") return [...PERMISSIONS];
  if (staff.role !== "RECEPTIONIST") return [];
  const allowed = staff.permissions === undefined ? RECEPTIONIST_PERMISSIONS : staff.permissions;
  if (!Array.isArray(allowed)) return [];
  return RECEPTIONIST_PERMISSIONS.filter((permission) => allowed.includes(permission));
}
