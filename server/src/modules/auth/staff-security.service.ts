import { z } from "zod";
import { Staff } from "./staff.model.js";
import { RECEPTIONIST_PERMISSIONS, STAFF_ROLES, type StaffRole } from "./permissions.js";
import { AppError } from "../../utils/AppError.js";
import type { ClientSession } from "mongoose";

const securityChangeSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  permissions: z.array(z.enum(RECEPTIONIST_PERMISSIONS)).nullable().optional(),
  isActive: z.boolean().optional(),
  // Future password handlers must hash and validate the password before calling this service.
  passwordHash: z.string().min(1).optional(),
}).refine((change) => Object.values(change).some((value) => value !== undefined));

export type StaffSecurityChange = z.infer<typeof securityChangeSchema>;

function versionFilter(staffId: string, version: number) {
  if (!/^[a-f\d]{24}$/i.test(staffId) || !Number.isSafeInteger(version) || version < 0) {
    throw new AppError(400, "Invalid staff session details");
  }
  return version === 0
    ? { _id: staffId, $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
    : { _id: staffId, sessionVersion: version };
}

// Compare-and-increment prevents a stale logout from revoking a newer login.
export async function revokeStaffSessions(staffId: string, version: number): Promise<void> {
  await Staff.updateOne(versionFilter(staffId, version), { $inc: { sessionVersion: 1 } });
}

// Shared security-write boundary, also used by audited Staff Management edits.
// Do not update these fields through save(), raw updates, or native MongoDB writes.
export async function updateStaffSecurity(
  actor: { role: StaffRole },
  staffId: string,
  expectedVersion: number,
  change: StaffSecurityChange,
  session?: ClientSession
) {
  if (actor.role !== "ADMIN") throw new AppError(403, "You do not have permission");
  const parsed = securityChangeSchema.safeParse(change);
  if (!parsed.success) throw new AppError(400, "Invalid staff security changes");
  const { permissions, ...fields } = parsed.data;
  const staff = await Staff.findOneAndUpdate(
    versionFilter(staffId, expectedVersion),
    {
      $set: { ...fields, ...(permissions !== undefined && permissions !== null ? { permissions } : {}) },
      ...(permissions === null ? { $unset: { permissions: 1 } } : {}),
      $inc: { sessionVersion: 1 },
    },
    { new: true, runValidators: true, ...(session ? { session } : {}) }
  );
  if (!staff) throw new AppError(409, "Staff account changed. Refresh and try again.");
  return staff;
}
