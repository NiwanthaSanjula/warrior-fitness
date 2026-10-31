import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";
import type { z } from "zod";
import { AppError } from "../../utils/AppError.js";
import { Staff, toPublicStaff, type IStaff } from "../auth/staff.model.js";
import { updateStaffSecurity, type StaffSecurityChange } from "../auth/staff-security.service.js";
import { StaffAudit, type IStaffAudit } from "./staff-audit.model.js";
import type { auditQuerySchema, createStaffSchema, staffQuerySchema } from "./staff.validation.js";

type Actor = { id: string; fullName: string; role: "ADMIN" | "RECEPTIONIST" };
export function managedStaff(staff: HydratedDocument<IStaff>) {
  return { ...toPublicStaff(staff), version: staff.sessionVersion ?? 0, permissionMode: staff.permissions === undefined ? "DEFAULT" as const : "CUSTOM" as const };
}
function transaction<T>(work: (session: ClientSession) => Promise<T>) {
  return mongoose.connection.transaction(work, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
}
function requireAdmin(actor: Actor) { if (actor.role !== "ADMIN") throw new AppError(403, "Admin access is required"); }
async function audit(actor: Actor, target: HydratedDocument<IStaff>, action: IStaffAudit["action"], session: ClientSession) {
  const event = new StaffAudit({ actor: actor.id, actorName: actor.fullName, target: target._id, targetName: target.fullName, action });
  await event.save({ session });
}
export async function createReceptionist(actor: Actor, input: z.infer<typeof createStaffSchema>) {
  requireAdmin(actor);
  const passwordHash = await bcrypt.hash(input.password, 12);
  return transaction(async (session) => {
    if (await Staff.findOne({ email: input.email }).session(session)) throw new AppError(409, "A staff account with this email already exists");
    const staff = new Staff({ fullName: input.fullName, email: input.email, passwordHash, role: "RECEPTIONIST", isActive: true });
    await staff.save({ session });
    await audit(actor, staff, "STAFF_CREATED", session);
    return managedStaff(staff);
  });
}
export type StaffMutation =
  | { kind: "profile"; fullName: string; email: string }
  | { kind: "permissions"; permissions: NonNullable<StaffSecurityChange["permissions"]> | null }
  | { kind: "status"; isActive: boolean }
  | { kind: "password"; password: string };

export async function mutateStaff(actor: Actor, staffId: string, expectedVersion: number, input: StaffMutation) {
  requireAdmin(actor);
  if (input.kind === "status" && !input.isActive && actor.id === staffId) throw new AppError(409, "You cannot deactivate your own account");
  // Hash outside the transaction. Only the hash reaches the security boundary;
  // neither it nor the plaintext is ever passed to audit().
  const passwordHash = input.kind === "password" ? await bcrypt.hash(input.password, 12) : undefined;
  return transaction(async (session) => {
    const current = await Staff.findById(staffId).session(session);
    if (!current) throw new AppError(404, "Staff account not found");
    if ((current.sessionVersion ?? 0) !== expectedVersion) throw new AppError(409, "Staff account changed. Refresh before trying again.");
    // No role-change endpoint exists. All Admin activation/permission edits are
    // rejected, so even concurrent requests cannot disable/demote the last Admin.
    if ((input.kind === "status" || input.kind === "permissions") && current.role !== "RECEPTIONIST") {
      throw new AppError(409, "Admin roles, activation and full-access permissions are protected");
    }
    let change: StaffSecurityChange;
    let action: IStaffAudit["action"];
    switch (input.kind) {
      case "profile":
        if (current.fullName === input.fullName && current.email === input.email) return { staff: managedStaff(current), changed: false };
        change = { fullName: input.fullName, email: input.email }; action = "PROFILE_UPDATED"; break;
      case "permissions":
        if (JSON.stringify(current.permissions ?? null) === JSON.stringify(input.permissions)) return { staff: managedStaff(current), changed: false };
        change = { permissions: input.permissions ?? null };
        action = input.permissions === null ? "PERMISSIONS_DEFAULTS_RESTORED" : "PERMISSIONS_CHANGED"; break;
      case "status":
        if (current.isActive === input.isActive) return { staff: managedStaff(current), changed: false };
        change = { isActive: input.isActive }; action = input.isActive ? "STAFF_ACTIVATED" : "STAFF_DEACTIVATED"; break;
      case "password": change = { passwordHash: passwordHash! }; action = "PASSWORD_RESET"; break;
    }
    const updated = await updateStaffSecurity(actor, staffId, expectedVersion, change, session);
    await audit(actor, updated, action, session);
    return { staff: managedStaff(updated), changed: true };
  });
}

export async function listStaff(query: z.infer<typeof staffQuerySchema>) {
  const filter: Record<string, unknown> = {};
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ fullName: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }];
  }
  if (query.role) filter.role = query.role;
  if (query.status) filter.isActive = query.status === "active";
  const staff = await Staff.find(filter).sort({ createdAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit);
  const total = await Staff.countDocuments(filter);
  return { data: staff.map(managedStaff), pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
}
export async function getManagedStaff(id: string) {
  const staff = await Staff.findById(id);
  if (!staff) throw new AppError(404, "Staff account not found");
  return managedStaff(staff);
}
export async function listStaffAudit(query: z.infer<typeof auditQuerySchema>) {
  const filter = query.targetId ? { target: query.targetId } : {};
  const records = await StaffAudit.find(filter).sort({ createdAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit);
  const total = await StaffAudit.countDocuments(filter);
  return {
    data: records.map((record) => ({ id: record.id, actorId: record.actor.toString(), actorName: record.actorName, targetId: record.target.toString(), targetName: record.targetName, action: record.action, recordedAt: record.createdAt.toISOString() })),
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}
export async function initializeStaffAdministration(): Promise<void> {
  await Promise.all([Staff.init(), StaffAudit.init()]);
}
