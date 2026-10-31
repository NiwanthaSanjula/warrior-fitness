import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Staff, type IStaff } from "../src/modules/auth/staff.model.js";
import { StaffAudit, type IStaffAudit } from "../src/modules/staff/staff-audit.model.js";
import { createReceptionist, getManagedStaff, listStaff, listStaffAudit, mutateStaff } from "../src/modules/staff/staff.service.js";
import { staffPermissionCatalogue } from "../src/modules/staff/staff-permissions.js";
import { createStaffSchema, resetPasswordSchema, updatePermissionsSchema, updateProfileSchema } from "../src/modules/staff/staff.validation.js";
import { RECEPTIONIST_PERMISSIONS } from "../src/modules/auth/permissions.js";
import { staffFixture } from "./helpers/staff.js";

const actor = { id: "000000000000000000000001", fullName: "Example Admin", role: "ADMIN" as const };
const target = () => staffFixture("RECEPTIONIST", { sessionVersion: 3 });
const session = {} as ClientSession;
const sessionResult = (value: unknown) => ({ session: vi.fn().mockResolvedValue(value) }) as never;
const savedStaff: HydratedDocument<IStaff>[] = [];
const savedAudit: HydratedDocument<IStaffAudit>[] = [];
let auditFails = false;
beforeEach(() => {
  savedStaff.length = 0; savedAudit.length = 0; auditFails = false;
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async (work) => work(session));
  vi.spyOn(bcrypt, "hash").mockImplementation(async () => "fictional-new-hash-not-a-real-credential");
  vi.spyOn(Staff, "findOne").mockReturnValue(sessionResult(null));
  vi.spyOn(Staff, "findById").mockReturnValue(sessionResult(target()));
  vi.spyOn(Staff, "findOneAndUpdate").mockResolvedValue(staffFixture("RECEPTIONIST", { sessionVersion: 4 }));
  vi.spyOn(mongoose.Model.prototype, "save").mockImplementation(async function (this: HydratedDocument<IStaff> | HydratedDocument<IStaffAudit>) {
    this.set("createdAt", new Date());
    if (this instanceof Staff) savedStaff.push(this);
    else if (this instanceof StaffAudit) {
      if (auditFails) throw new Error("Fictional audit persistence failure");
      savedAudit.push(this);
    } else throw new Error("Unexpected staff test write");
    return this;
  });
});

describe("staff validation and permission catalogue", () => {
  it("groups every assignable Receptionist permission exactly once and never includes Admin-only keys", () => {
    const catalogue = staffPermissionCatalogue();
    const keys = catalogue.groups.flatMap((group) => group.permissions.map((permission) => permission.key));
    expect(keys).toEqual([...RECEPTIONIST_PERMISSIONS]);
    expect(catalogue.defaultPermissions).toEqual([...RECEPTIONIST_PERMISSIONS]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("staff.manage"); expect(keys).not.toContain("reports.read");
  });
  it("normalizes names/emails and rejects role or hash injection", () => {
    const data = { fullName: " Example Staff ", email: " EXAMPLE@EXAMPLE.TEST ", password: "fictional-new-password" };
    expect(createStaffSchema.parse(data)).toMatchObject({ fullName: "Example Staff", email: "example@example.test" });
    expect(createStaffSchema.safeParse({ ...data, role: "ADMIN" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ fullName: "Example", email: "example@example.test", expectedVersion: 0, passwordHash: "injection" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ fullName: "Example", email: "example@example.test", expectedVersion: 0, role: "RECEPTIONIST" }).success).toBe(false);
  });
  it.each(["short", "x".repeat(73), "😀".repeat(19)])("rejects invalid password length including UTF-8 bytes", (password) => {
    expect(resetPasswordSchema.safeParse({ password, expectedVersion: 0 }).success).toBe(false);
  });
  it("supports explicit deny-all and default restoration while rejecting privileged/duplicate/unknown keys", () => {
    expect(updatePermissionsSchema.parse({ permissions: [], expectedVersion: 0 }).permissions).toEqual([]);
    expect(updatePermissionsSchema.parse({ permissions: null, expectedVersion: 0 }).permissions).toBeNull();
    for (const permissions of [["staff.manage"], ["expenses.manage"], ["members.read", "members.read"], ["unknown"]]) {
      expect(updatePermissionsSchema.safeParse({ permissions, expectedVersion: 0 }).success).toBe(false);
    }
  });
});

describe("audited staff administration with explicitly mocked persistence", () => {
  it("creates only an active Receptionist with defaults and a same-session creation audit", async () => {
    const result = await createReceptionist(actor, { fullName: "Example New Staff", email: "new@example.test", password: "fictional-new-password" });
    expect(result).toMatchObject({ role: "RECEPTIONIST", isActive: true, permissionMode: "DEFAULT", version: 0, permissions: [...RECEPTIONIST_PERMISSIONS] });
    expect(bcrypt.hash).toHaveBeenCalledWith("fictional-new-password", 12);
    expect(savedStaff).toHaveLength(1); expect(savedAudit).toHaveLength(1);
    expect(savedAudit[0]).toMatchObject({ action: "STAFF_CREATED", actorName: actor.fullName, targetName: "Example New Staff" });
    expect(savedAudit[0].target.toString()).toBe(result.id);
    expect(mongoose.Model.prototype.save).toHaveBeenNthCalledWith(1, { session });
    expect(mongoose.Model.prototype.save).toHaveBeenNthCalledWith(2, { session });
    expect(JSON.stringify(result)).not.toMatch(/password|fictional-new-hash/);
    expect(mongoose.connection.transaction).toHaveBeenCalledWith(expect.any(Function), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
  });
  it("does not append a success audit when creation conflicts with an existing email", async () => {
    vi.mocked(Staff.findOne).mockReturnValue(sessionResult(target()));
    await expect(createReceptionist(actor, { fullName: "Example", email: target().email, password: "fictional-new-password" })).rejects.toHaveProperty("statusCode", 409);
    expect(savedStaff).toHaveLength(0); expect(savedAudit).toHaveLength(0);
  });
  it.each([
    [{ kind: "profile", fullName: "Changed Example", email: "changed@example.test" }, { fullName: "Changed Example", email: "changed@example.test" }, "PROFILE_UPDATED"],
    [{ kind: "permissions", permissions: [] }, { permissions: [] }, "PERMISSIONS_CHANGED"],
    [{ kind: "status", isActive: false }, { isActive: false }, "STAFF_DEACTIVATED"],
    [{ kind: "password", password: "fictional-new-password" }, { passwordHash: "fictional-new-hash-not-a-real-credential" }, "PASSWORD_RESET"],
  ] as const)("uses shared compare-and-increment for $0.kind and records the correct event", async (input, fields, action) => {
    await mutateStaff(actor, target().id, 3, input as Parameters<typeof mutateStaff>[3]);
    expect(Staff.findOneAndUpdate).toHaveBeenCalledWith({ _id: target().id, sessionVersion: 3 }, { $set: fields, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true, session });
    expect(savedAudit).toHaveLength(1); expect(savedAudit[0].action).toBe(action);
    const event = JSON.stringify(savedAudit[0].toObject());
    expect(event).not.toContain("fictional-new-password"); expect(event).not.toContain("fictional-new-hash");
    expect(event).not.toContain('"passwordHash"'); expect(event).not.toContain('"email"');
  });
  it("activates an inactive Receptionist using a fresh version and an activation audit", async () => {
    vi.mocked(Staff.findById).mockReturnValue(sessionResult(staffFixture("RECEPTIONIST", { isActive: false, sessionVersion: 3 })));
    await mutateStaff(actor, target().id, 3, { kind: "status", isActive: true });
    expect(Staff.findOneAndUpdate).toHaveBeenCalledWith(expect.any(Object), { $set: { isActive: true }, $inc: { sessionVersion: 1 } }, expect.objectContaining({ session }));
    expect(savedAudit[0].action).toBe("STAFF_ACTIVATED");
  });
  it("restores legacy defaults with unset plus version increment and a dedicated audit event", async () => {
    vi.mocked(Staff.findById).mockReturnValue(sessionResult(staffFixture("RECEPTIONIST", { permissions: [], sessionVersion: 3 })));
    await mutateStaff(actor, target().id, 3, { kind: "permissions", permissions: null });
    expect(Staff.findOneAndUpdate).toHaveBeenCalledWith(expect.any(Object), { $set: {}, $unset: { permissions: 1 }, $inc: { sessionVersion: 1 } }, expect.objectContaining({ session }));
    expect(savedAudit[0].action).toBe("PERMISSIONS_DEFAULTS_RESTORED");
  });
  it("does not record no-op profile/status/default edits as successful changes", async () => {
    const current = target();
    for (const input of [{ kind: "profile", fullName: current.fullName, email: current.email }, { kind: "status", isActive: true }, { kind: "permissions", permissions: null }] as const) {
      expect((await mutateStaff(actor, current.id, 3, input)).changed).toBe(false);
    }
    expect(Staff.findOneAndUpdate).not.toHaveBeenCalled(); expect(savedAudit).toHaveLength(0);
  });
  it("rejects stale versions before security writes or success audit", async () => {
    await expect(mutateStaff(actor, target().id, 2, { kind: "status", isActive: false })).rejects.toHaveProperty("statusCode", 409);
    expect(Staff.findOneAndUpdate).not.toHaveBeenCalled(); expect(savedAudit).toHaveLength(0);
  });
  it("propagates conditional-write conflicts without appending audit success", async () => {
    vi.mocked(Staff.findOneAndUpdate).mockResolvedValue(null);
    await expect(mutateStaff(actor, target().id, 3, { kind: "permissions", permissions: [] })).rejects.toHaveProperty("statusCode", 409);
    expect(savedAudit).toHaveLength(0);
  });
  it("fails the transaction callback when audit persistence fails rather than reporting success", async () => {
    auditFails = true;
    await expect(mutateStaff(actor, target().id, 3, { kind: "status", isActive: false })).rejects.toThrow("audit persistence failure");
    expect(savedAudit).toHaveLength(0);
    // This checks transactional wiring/error propagation, not real MongoDB rollback.
  });
  it("rejects self-deactivation before any transaction", async () => {
    await expect(mutateStaff(actor, actor.id, 0, { kind: "status", isActive: false })).rejects.toThrow("own account");
    expect(mongoose.connection.transaction).not.toHaveBeenCalled(); expect(savedAudit).toHaveLength(0);
  });
  it.each(["status", "permissions"] as const)("protects every Admin, including the last active Admin, from %s changes", async (kind) => {
    const admin = staffFixture("ADMIN", { sessionVersion: 3 });
    vi.mocked(Staff.findById).mockReturnValue(sessionResult(admin));
    const otherAdmin = { ...actor, id: "000000000000000000000003" };
    await expect(mutateStaff(otherAdmin, admin.id, 3, kind === "status" ? { kind, isActive: false } : { kind, permissions: [] })).rejects.toHaveProperty("statusCode", 409);
    expect(Staff.findOneAndUpdate).not.toHaveBeenCalled(); expect(savedAudit).toHaveLength(0);
  });
  it("rejects non-Admin writes even when the service is called directly", async () => {
    await expect(mutateStaff({ ...actor, role: "RECEPTIONIST" }, target().id, 3, { kind: "status", isActive: false })).rejects.toHaveProperty("statusCode", 403);
    expect(mongoose.connection.transaction).not.toHaveBeenCalled(); expect(savedAudit).toHaveLength(0);
  });
  it("returns not found without a success audit", async () => {
    vi.mocked(Staff.findById).mockReturnValue(sessionResult(null));
    await expect(mutateStaff(actor, target().id, 3, { kind: "status", isActive: false })).rejects.toHaveProperty("statusCode", 404);
    expect(savedAudit).toHaveLength(0);
  });
  it("rejects secret fields in the audit model itself", () => {
    expect(() => new StaffAudit({ actor: actor.id, target: target().id, actorName: actor.fullName, targetName: target().fullName, action: "PASSWORD_RESET", passwordHash: "fictional-not-allowed" })).toThrow();
    expect(StaffAudit.schema.path("action").options.immutable).toBe(true);
  });
  it("accepts historical staff names longer than the new profile form limit", async () => {
    // The pre-existing Staff schema has no name maxlength. Such an actor must
    // not lose the ability to administer staff because audit validation fails.
    const event = new StaffAudit({ actor: actor.id, target: target().id, actorName: "Example ".repeat(20), targetName: "Legacy ".repeat(20), action: "PASSWORD_RESET" });
    await expect(event.validate()).resolves.toBeUndefined();
  });
});

describe("staff directory/detail/audit read boundaries", () => {
  it("filters name/email literally and paginates directory with safe managed DTOs", async () => {
    const query = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([target()]) };
    vi.spyOn(Staff, "find").mockReturnValue(query as never); vi.spyOn(Staff, "countDocuments").mockResolvedValue(11);
    const result = await listStaff({ search: "staff.*", role: "RECEPTIONIST", status: "active", page: 2, limit: 10 });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 11, totalPages: 2 });
    expect(Staff.find).toHaveBeenCalledWith({ role: "RECEPTIONIST", isActive: true, $or: [{ fullName: { $regex: "staff\\.\\*", $options: "i" } }, { email: { $regex: "staff\\.\\*", $options: "i" } }] });
    expect(query.skip).toHaveBeenCalledWith(10); expect(result.data[0]).not.toHaveProperty("passwordHash");
  });
  it("bounds audit reads and exposes only actor/action/target/timestamp fields", async () => {
    const event = StaffAudit.hydrate({ _id: "000000000000000000000010", actor: actor.id, actorName: actor.fullName, target: target().id, targetName: target().fullName, action: "PASSWORD_RESET", createdAt: new Date() });
    const query = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([event]) };
    vi.spyOn(StaffAudit, "find").mockReturnValue(query as never); vi.spyOn(StaffAudit, "countDocuments").mockResolvedValue(1);
    const result = await listStaffAudit({ targetId: target().id, page: 1, limit: 10 });
    expect(StaffAudit.find).toHaveBeenCalledWith({ target: target().id }); expect(query.limit).toHaveBeenCalledWith(10);
    expect(Object.keys(result.data[0]).sort()).toEqual(["id", "actorId", "actorName", "targetId", "targetName", "action", "recordedAt"].sort());
  });
  it("returns a safe detail payload and handles missing records", async () => {
    vi.mocked(Staff.findById).mockResolvedValueOnce(target());
    expect(await getManagedStaff(target().id)).toMatchObject({ version: 3, permissionMode: "DEFAULT" });
    vi.mocked(Staff.findById).mockResolvedValueOnce(null);
    await expect(getManagedStaff(target().id)).rejects.toHaveProperty("statusCode", 404);
  });
});
