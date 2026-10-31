import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { AppError } from "../../utils/AppError.js";
import { staffPermissionCatalogue } from "./staff-permissions.js";
import { createReceptionist, getManagedStaff, listStaff, listStaffAudit, mutateStaff } from "./staff.service.js";
import {
  auditQuerySchema, createStaffSchema, resetPasswordSchema, staffIdSchema, staffQuerySchema,
  updatePermissionsSchema, updateProfileSchema, updateStatusSchema,
} from "./staff.validation.js";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(400, `${issue.path.join(".") || "Input"}: ${issue.message}`);
  }
  return result.data;
}
export const staffRouter = Router();
staffRouter.use(requireAuth, requireRole("ADMIN"), requirePermission("staff.manage"));

staffRouter.get("/permissions", (_req, res) => res.json({ success: true, ...staffPermissionCatalogue() }));
staffRouter.get("/audit", async (req, res) => res.json({ success: true, ...await listStaffAudit(parse(auditQuerySchema, req.query)) }));
staffRouter.get("/", async (req, res) => res.json({ success: true, ...await listStaff(parse(staffQuerySchema, req.query)) }));
staffRouter.get("/:id", async (req, res) => res.json({ success: true, staff: await getManagedStaff(parse(staffIdSchema, req.params.id)) }));

// Preserve the existing create-Receptionist endpoint and response contract.
staffRouter.post("/", async (req, res) => {
  const staff = await createReceptionist(req.staff!, parse(createStaffSchema, req.body));
  res.status(201).json({ success: true, message: "Receptionist account created", staff });
});
staffRouter.patch("/:id/profile", async (req, res) => {
  const id = parse(staffIdSchema, req.params.id);
  const { expectedVersion, ...profile } = parse(updateProfileSchema, req.body);
  res.json({ success: true, ...await mutateStaff(req.staff!, id, expectedVersion, { kind: "profile", ...profile }) });
});
staffRouter.patch("/:id/permissions", async (req, res) => {
  const id = parse(staffIdSchema, req.params.id);
  const { expectedVersion, permissions } = parse(updatePermissionsSchema, req.body);
  res.json({ success: true, ...await mutateStaff(req.staff!, id, expectedVersion, { kind: "permissions", permissions }) });
});
staffRouter.patch("/:id/status", async (req, res) => {
  const id = parse(staffIdSchema, req.params.id);
  const { expectedVersion, isActive } = parse(updateStatusSchema, req.body);
  res.json({ success: true, ...await mutateStaff(req.staff!, id, expectedVersion, { kind: "status", isActive }) });
});
staffRouter.post("/:id/reset-password", async (req, res) => {
  const id = parse(staffIdSchema, req.params.id);
  const { expectedVersion, password } = parse(resetPasswordSchema, req.body);
  res.json({ success: true, ...await mutateStaff(req.staff!, id, expectedVersion, { kind: "password", password }) });
});
