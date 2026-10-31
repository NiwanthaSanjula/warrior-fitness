import type { AuthStaff } from "../auth/auth-context";
import type { Permission } from "../auth/permissions";

export interface ManagedStaff extends AuthStaff {
  isActive: boolean; version: number; permissionMode: "DEFAULT" | "CUSTOM";
}
export interface StaffPagination { page: number; limit: number; total: number; totalPages: number }
export interface StaffFilters { search?: string; role?: "ADMIN" | "RECEPTIONIST"; status?: "active" | "inactive"; page?: number; limit?: number }
export interface StaffDirectory { success: boolean; data: ManagedStaff[]; pagination: StaffPagination }
export interface StaffCatalogue {
  success: boolean; defaultPermissions: Permission[];
  groups: { module: string; label: string; permissions: { key: Permission; label: string }[] }[];
}
export interface StaffResult { success: boolean; staff: ManagedStaff; changed?: boolean }
export interface CreateStaffInput { fullName: string; email: string; password: string }
export const staffAuditLabels = {
  STAFF_CREATED: "Receptionist created", PROFILE_UPDATED: "Profile updated",
  PERMISSIONS_CHANGED: "Permissions changed", PERMISSIONS_DEFAULTS_RESTORED: "Default permissions restored",
  STAFF_ACTIVATED: "Account activated", STAFF_DEACTIVATED: "Account deactivated", PASSWORD_RESET: "Password reset",
} as const;
export interface StaffAuditRecord {
  id: string; actorId: string; actorName: string; targetId: string; targetName: string;
  action: keyof typeof staffAuditLabels; recordedAt: string;
}
export interface StaffAuditResponse { success: boolean; data: StaffAuditRecord[]; pagination: StaffPagination }
export type StaffAction =
  | { kind: "profile"; fullName: string; email: string }
  | { kind: "permissions"; permissions: Permission[] | null }
  | { kind: "status"; isActive: boolean }
  | { kind: "password" };
