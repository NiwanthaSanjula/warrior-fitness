import { z } from "zod";
import { RECEPTIONIST_PERMISSIONS } from "../auth/permissions.js";

export const staffIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid staff ID");
export const staffPasswordSchema = z.string().min(12, "Use at least 12 characters").refine(
  (value) => Buffer.byteLength(value, "utf8") <= 72, "Password must not exceed 72 UTF-8 bytes",
);
export const staffProfileFields = {
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
};
export const createStaffSchema = z.strictObject({ ...staffProfileFields, password: staffPasswordSchema });
const expectedVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const updateProfileSchema = z.strictObject({ ...staffProfileFields, expectedVersion });
export const updatePermissionsSchema = z.strictObject({
  permissions: z.array(z.enum(RECEPTIONIST_PERMISSIONS)).max(RECEPTIONIST_PERMISSIONS.length).refine((value) => new Set(value).size === value.length, "Duplicate permissions are not allowed").nullable(),
  expectedVersion,
});
export const updateStatusSchema = z.strictObject({ isActive: z.boolean(), expectedVersion });
export const resetPasswordSchema = z.strictObject({ password: staffPasswordSchema, expectedVersion });
export const staffQuerySchema = z.strictObject({
  search: z.string().trim().max(100).default(""),
  role: z.enum(["ADMIN", "RECEPTIONIST"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export const auditQuerySchema = z.strictObject({
  targetId: staffIdSchema.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
