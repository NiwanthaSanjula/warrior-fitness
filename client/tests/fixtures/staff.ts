import type { ManagedStaff, StaffAuditResponse, StaffCatalogue, StaffDirectory } from "../../src/types/staff";
import { staffPermissionCatalogue } from "../../../server/src/modules/staff/staff-permissions";
import { admin, receptionist } from "../helpers/auth";

export const managedAdmin: ManagedStaff = { ...admin, isActive: true, version: 0, permissionMode: "DEFAULT" };
export const managedReceptionist: ManagedStaff = { ...receptionist, isActive: true, version: 3, permissionMode: "DEFAULT" };
export const inactiveStaff: ManagedStaff = {
  ...receptionist, id: "000000000000000000000003", fullName: "Inactive Example", email: "inactive@example.test",
  isActive: false, permissions: [], version: 8, permissionMode: "CUSTOM",
};
export const staffDirectory: StaffDirectory = {
  success: true, data: [managedAdmin, managedReceptionist, inactiveStaff],
  pagination: { page: 1, limit: 10, total: 3, totalPages: 1 },
};
export const staffCatalogue: StaffCatalogue = { success: true, ...staffPermissionCatalogue() };
export const staffAudit: StaffAuditResponse = {
  success: true,
  data: [{ id: "000000000000000000000010", actorId: admin.id, actorName: admin.fullName,
    targetId: receptionist.id, targetName: receptionist.fullName, action: "STAFF_CREATED", recordedAt: "2026-01-15T06:00:00.000Z" }],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};
