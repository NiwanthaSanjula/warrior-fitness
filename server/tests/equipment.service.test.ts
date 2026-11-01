import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Equipment, EquipmentDowntime, EquipmentEvent, EquipmentExpenseLink, EquipmentIncident, MaintenanceWork, type IEquipment, type IIncident, type IWorkOrder } from "../src/modules/equipment/equipment.model.js";
import { Expense } from "../src/modules/financial/expense.model.js";
import * as mutations from "../src/modules/equipment/equipment.mutations.js";
import * as service from "../src/modules/equipment/equipment.service.js";
import * as validation from "../src/modules/equipment/equipment.validation.js";
import { effectivePermissions } from "../src/modules/auth/permissions.js";

const id = "000000000000000000000100", workId = "000000000000000000000101", incidentId = "000000000000000000000102", expenseId = "000000000000000000000103";
const admin: service.EquipmentActor = { id: "000000000000000000000001", fullName: "Fictional Admin", role: "ADMIN", permissions: [] };
const receptionist: service.EquipmentActor = { ...admin, id: "000000000000000000000002", role: "RECEPTIONIST", permissions: ["equipment.read", "equipment.report"] };
const session = {} as ClientSession;
const sessionValue = (value: unknown) => ({ session: vi.fn().mockResolvedValue(value) }) as never;
const query = (value: unknown) => ({ sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });
const profile = () => validation.createEquipmentSchema.parse({ assetId: "GYM-100", name: "Fictional treadmill", category: "CARDIO", location: "Ground floor", purchaseDate: "2020-01-01", purchasePriceLkr: 200000, intervalDays: 30, nextServiceDate: "2026-01-20" });
const equipmentFixture = (fields: Partial<IEquipment> = {}) => Equipment.hydrate({ ...profile(), _id: id, status: "OPERATIONAL", version: 2, createdBy: admin.id, ...fields });
const faultFixture = (fields: Partial<IIncident> = {}) => EquipmentIncident.hydrate({ _id: incidentId, equipment: id, requestId: "11111111-1111-4111-8111-111111111111", description: "Fictional belt makes a loud noise", severity: "HIGH", status: "OPEN", reportedBy: receptionist.id, reporterName: "Example Reporter", reportedAt: new Date("2026-01-15T05:00:00Z"), reviewNotes: "Private assessment", closedAt: null, ...fields });
const workFixture = (fields: Partial<IWorkOrder> = {}) => MaintenanceWork.hydrate({ _id: workId, equipment: id, assetId: "GYM-100", equipmentName: "Fictional treadmill", title: "Inspect and service belt", kind: "PREVENTIVE", status: "OPEN", plannedDate: "2026-01-15", technician: "Example Technician", provider: "Example Services", contact: "Private contact", estimatedCostLkr: 5000, notes: "Private instructions", repairNotes: "Private repair notes", createdBy: admin.id, createdByName: admin.fullName, createdAt: new Date("2026-01-15T05:00:00Z"), ...fields });
let equipment: HydratedDocument<IEquipment>, fault: HydratedDocument<IIncident>, work: HydratedDocument<IWorkOrder>;
const saved: mongoose.Document[] = [];
let failEvents = false;
beforeEach(() => {
  vi.setSystemTime(new Date("2026-01-15T19:00:00Z")); // Jan 16 in Colombo; only Date is faked by setup.
  equipment = equipmentFixture(); fault = faultFixture(); work = workFixture(); saved.length = 0; failEvents = false;
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async callback => callback(session));
  vi.spyOn(Equipment, "findById").mockReturnValue(sessionValue(equipment));
  vi.spyOn(Equipment, "exists").mockReturnValue(sessionValue(null));
  vi.spyOn(Equipment, "updateOne").mockResolvedValue({ matchedCount: 1 } as never);
  vi.spyOn(EquipmentIncident, "findOne").mockReturnValue(sessionValue(fault));
  vi.spyOn(EquipmentIncident, "exists").mockReturnValue(sessionValue(null));
  vi.spyOn(EquipmentIncident, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
  vi.spyOn(MaintenanceWork, "findOne").mockReturnValue(sessionValue(work));
  vi.spyOn(MaintenanceWork, "exists").mockReturnValue(sessionValue(null));
  vi.spyOn(EquipmentDowntime, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
  vi.spyOn(EquipmentExpenseLink, "findOne").mockReturnValue(sessionValue(null));
  vi.spyOn(Expense, "findById").mockReturnValue(sessionValue(Expense.hydrate({ _id: expenseId, category: "MAINTENANCE", amountLkr: 3500, description: "Fictional repair" })));
  vi.spyOn(mongoose.Model.prototype, "save").mockImplementation(async function(this: mongoose.Document) {
    if (![Equipment, EquipmentIncident, MaintenanceWork, EquipmentDowntime, EquipmentEvent, EquipmentExpenseLink].some(Model => this instanceof Model)) throw new Error("Unexpected equipment test write");
    if (failEvents && this instanceof EquipmentEvent) throw new Error("Fictional history failure");
    saved.push(this); return this;
  });
});

describe("equipment validation, indexes and permission defaults", () => {
  it("normalizes an immutable unique asset ID", () => {
    expect(validation.createEquipmentSchema.parse({ ...profile(), assetId: " gym-100 " }).assetId).toBe("GYM-100");
    expect(Equipment.schema.path("assetId").options).toMatchObject({ unique: true, immutable: true });
    expect(EquipmentExpenseLink.schema.path("expense").options.unique).toBe(true);
    expect(EquipmentDowntime.schema.indexes()).toContainEqual([{ equipment: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { isOpen: true } })]);
  });
  it.each([{ purchasePriceLkr: 2.5 }, { purchasePriceLkr: -1 }, { purchaseDate: "2026-01-17" }, { warrantyExpiry: "2019-12-31" }, { intervalDays: 30, nextServiceDate: null }, { status: "RETIRED" }, { createdBy: admin.id }, { assetId: "bad/id" }])("rejects invalid or injected profile fields %j", input => {
    expect(validation.createEquipmentSchema.safeParse({ ...profile(), ...input }).success).toBe(false);
  });
  it.each([{ version: -1 }, { reason: "bad", version: 0 }, { status: "UNKNOWN", version: 0 }, { status: "RETIRED", reason: "Valid reason", version: 0, actor: admin.id }])("rejects malformed state requests %j", input => {
    expect(validation.statusInput.safeParse(input).success).toBe(false);
  });
  it("bounds pagination and validates fault keys, descriptions and work completion", () => {
    expect(validation.inventoryQuery.parse({})).toMatchObject({ page: 1, limit: 10 });
    for (const input of [{ limit: 51 }, { page: 0 }, { q: { $ne: "" } }]) expect(validation.inventoryQuery.safeParse(input).success).toBe(false);
    expect(validation.incidentInput.safeParse({ requestId: "bad", description: "short", severity: "HIGH", version: 2 }).success).toBe(false);
    expect(validation.workActionInput.safeParse({ action: "COMPLETE", repairNotes: "short", returnToService: true, version: 2 }).success).toBe(false);
    expect(validation.workActionInput.safeParse({ action: "COMPLETE", repairNotes: "Valid repair note", returnToService: true, nextServiceDate: "2026-01-16", version: 2 }).success).toBe(false);
    expect(validation.assignInput.safeParse({ version: 2 }).success).toBe(false);
  });
  it("adds safe legacy Receptionist defaults while retaining explicit deny-all and custom lists", () => {
    expect(effectivePermissions({ role: "RECEPTIONIST" })).toEqual(expect.arrayContaining(["equipment.read", "equipment.report"]));
    expect(effectivePermissions({ role: "RECEPTIONIST", permissions: [] })).toEqual([]);
    expect(effectivePermissions({ role: "RECEPTIONIST", permissions: ["members.read"] })).toEqual(["members.read"]);
  });
  it("validates whole LKR at the Mongoose boundary too", async () => {
    equipment.purchasePriceLkr = 0.5;
    await expect(equipment.validate()).rejects.toThrow();
    work.estimatedCostLkr = -2;
    await expect(work.validate()).rejects.toThrow();
  });
});

describe("transactional equipment mutations with mocked persistence", () => {
  it("registers operational equipment with actor and history in the same transaction", async () => {
    const result = await mutations.createEquipment(admin, profile());
    expect(result).toMatchObject({ assetId: "GYM-100", status: "OPERATIONAL", purchasePriceLkr: 200000 });
    expect(saved.filter(row => row instanceof EquipmentEvent)).toHaveLength(1);
    expect(mongoose.Model.prototype.save).toHaveBeenCalledWith({ session });
    expect(mongoose.connection.transaction).toHaveBeenCalledWith(expect.any(Function), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
  });
  it("rejects duplicate IDs before saving anything", async () => {
    vi.mocked(Equipment.exists).mockReturnValue(sessionValue({ _id: id }));
    await expect(mutations.createEquipment(admin, profile())).rejects.toHaveProperty("statusCode", 409);
    expect(saved).toHaveLength(0);
  });
  it("updates metadata with a version compare-and-increment and audit event", async () => {
    const { assetId: _assetId, ...fields } = profile();
    await mutations.updateEquipment(admin, id, { ...fields, name: "Corrected treadmill", version: 2 });
    expect(Equipment.updateOne).toHaveBeenCalledWith({ _id: id, version: 2 }, { $inc: { version: 1 } }, { session });
    expect(equipment.name).toBe("Corrected treadmill"); expect(equipment.version).toBe(3);
    expect(saved.find(row => row instanceof EquipmentEvent)).toHaveProperty("action", "PROFILE_UPDATED");
  });
  it.each(["stale", "lost-race"])("rejects %s before business writes/history", async kind => {
    if (kind === "lost-race") vi.mocked(Equipment.updateOne).mockResolvedValue({ matchedCount: 0 } as never);
    await expect(mutations.setEquipmentStatus(admin, id, { status: "OUT_OF_SERVICE", reason: "Needs inspection", version: kind === "stale" ? 1 : 2 })).rejects.toHaveProperty("statusCode", 409);
    expect(saved).toHaveLength(0);
  });
  it("fails the transaction callback if event persistence fails (not a live rollback test)", async () => {
    failEvents = true;
    await expect(mutations.createEquipment(admin, profile())).rejects.toThrow("history failure");
    expect(saved.filter(row => row instanceof EquipmentEvent)).toHaveLength(0);
  });
  it("opens one downtime span on unavailability and closes it on return", async () => {
    await mutations.setEquipmentStatus(admin, id, { status: "OUT_OF_SERVICE", reason: "Inspection needed", version: 2 });
    expect(saved.filter(row => row instanceof EquipmentDowntime)).toHaveLength(1);
    await mutations.setEquipmentStatus(admin, id, { status: "UNDER_MAINTENANCE", reason: "Repair started", version: 3 });
    expect(saved.filter(row => row instanceof EquipmentDowntime)).toHaveLength(1);
    await mutations.setEquipmentStatus(admin, id, { status: "OPERATIONAL", reason: "Safety check passed", version: 4 });
    expect(EquipmentDowntime.updateOne).toHaveBeenCalledWith({ equipment: equipment._id, isOpen: true }, { $set: { isOpen: false, endedAt: expect.any(Date) } }, { session, runValidators: true });
  });
  it.each(["work", "critical"])("prevents return to service while unresolved %s exists", async kind => {
    equipment.status = "UNDER_MAINTENANCE";
    vi.mocked(kind === "work" ? MaintenanceWork.exists : EquipmentIncident.exists).mockReturnValue(sessionValue({ _id: workId }));
    await expect(mutations.setEquipmentStatus(admin, id, { status: "OPERATIONAL", reason: "Attempt return", version: 2 })).rejects.toHaveProperty("statusCode", 409);
    expect(saved).toHaveLength(0);
  });
  it("prevents retirement with active work and prevents reviving a retired asset", async () => {
    vi.mocked(MaintenanceWork.exists).mockReturnValue(sessionValue({ _id: workId }));
    await expect(mutations.setEquipmentStatus(admin, id, { status: "RETIRED", reason: "Retirement reason", version: 2 })).rejects.toHaveProperty("statusCode", 409);
    expect(() => mutations.validateEquipmentTransition("RETIRED", "OPERATIONAL")).toThrow();
    expect(() => mutations.validateEquipmentTransition("OPERATIONAL", "OPERATIONAL")).toThrow();
  });
  it("records a Receptionist fault with authenticated reporter, never invented review state", async () => {
    vi.mocked(EquipmentIncident.findOne).mockResolvedValueOnce(null);
    const result = await mutations.reportIncident(receptionist, id, { requestId: fault.requestId, description: fault.description, severity: "HIGH", version: 2 });
    expect(result.result).toMatchObject({ reporterName: receptionist.fullName, status: "OPEN" });
    expect(result.result).not.toHaveProperty("reviewNotes");
    expect(saved.find(row => row instanceof EquipmentIncident)).toHaveProperty("reportedBy", new mongoose.Types.ObjectId(receptionist.id));
  });
  it("replays exactly the same fault key without another transaction", async () => {
    vi.mocked(EquipmentIncident.findOne).mockResolvedValueOnce(fault); vi.mocked(Equipment.findById).mockResolvedValueOnce(equipment);
    expect(await mutations.reportIncident(receptionist, id, { requestId: fault.requestId, description: fault.description, severity: fault.severity, version: 0 })).toHaveProperty("replayed", true);
    expect(mongoose.connection.transaction).not.toHaveBeenCalled(); expect(saved).toHaveLength(0);
  });
  it("rejects reuse of a fault key for different content", async () => {
    vi.mocked(EquipmentIncident.findOne).mockResolvedValueOnce(fault);
    await expect(mutations.reportIncident(receptionist, id, { requestId: fault.requestId, description: "Different description", severity: "HIGH", version: 2 })).rejects.toHaveProperty("statusCode", 409);
  });
  it("retired assets cannot receive new faults", async () => {
    equipment.status = "RETIRED"; vi.mocked(EquipmentIncident.findOne).mockResolvedValueOnce(null);
    await expect(mutations.reportIncident(receptionist, id, { requestId: fault.requestId, description: fault.description, severity: "HIGH", version: 2 })).rejects.toHaveProperty("statusCode", 409);
  });
  it("reviews faults without rewriting the original description/reporter", async () => {
    await mutations.reviewIncident(admin, id, incidentId, { action: "ACKNOWLEDGE", notes: "Investigation assigned", version: 2 });
    expect(fault.status).toBe("ACKNOWLEDGED"); expect(fault.description).toBe("Fictional belt makes a loud noise");
    expect(fault.reviewedBy?.toString()).toBe(admin.id);
  });
  it("blocks closing faults with active work and terminal fault transitions", async () => {
    vi.mocked(MaintenanceWork.exists).mockReturnValue(sessionValue({ _id: workId }));
    await expect(mutations.reviewIncident(admin, id, incidentId, { action: "RESOLVE", notes: "Trying to resolve", version: 2 })).rejects.toHaveProperty("statusCode", 409);
    fault.status = "RESOLVED";
    await expect(mutations.reviewIncident(admin, id, incidentId, { action: "DISMISS", notes: "Trying to dismiss", version: 3 })).rejects.toHaveProperty("statusCode", 409);
  });
  it("creates assigned work linked only to an unresolved fault on this equipment", async () => {
    const input = validation.workInput.parse({ title: "Repair noisy belt", kind: "REPAIR", plannedDate: "2026-01-20", incidentId, version: 2, provider: "Fictional Workshop" });
    const result = await mutations.createWork(admin, id, input);
    expect(result.result).toMatchObject({ status: "OPEN", provider: "Fictional Workshop", incidentId });
    expect(EquipmentIncident.findOne).toHaveBeenCalledWith({ _id: incidentId, equipment: id, status: { $in: ["OPEN", "ACKNOWLEDGED"] } });
  });
  it.each(["missing", "already-assigned"])("rejects %s linked faults", async condition => {
    if (condition === "missing") vi.mocked(EquipmentIncident.findOne).mockReturnValue(sessionValue(null));
    else vi.mocked(MaintenanceWork.exists).mockReturnValue(sessionValue({ _id: workId }));
    await expect(mutations.createWork(admin, id, validation.workInput.parse({ title: "Repair noisy belt", kind: "REPAIR", plannedDate: "2026-01-20", incidentId, version: 2 }))).rejects.toHaveProperty("statusCode", condition === "missing" ? 400 : 409);
    expect(saved).toHaveLength(0);
  });
  it("requires assignment before starting and tracks downtime when started", async () => {
    work.technician = ""; work.provider = "";
    await expect(mutations.transitionWork(admin, id, workId, { action: "START", version: 2 })).rejects.toHaveProperty("statusCode", 400);
    work.provider = "Example Services";
    await mutations.transitionWork(admin, id, workId, { action: "START", version: 3 });
    expect(work.status).toBe("IN_PROGRESS"); expect(equipment.status).toBe("UNDER_MAINTENANCE");
    expect(saved.some(row => row instanceof EquipmentDowntime)).toBe(true);
  });
  it.each(["PREVENTIVE", "REPAIR"] as const)("completes %s work, preserving repair records and appropriate service schedule", async kind => {
    work.kind = kind; work.status = "IN_PROGRESS"; work.incident = fault._id; equipment.status = "UNDER_MAINTENANCE";
    await mutations.transitionWork(admin, id, workId, { action: "COMPLETE", repairNotes: "Belt inspected and repaired", returnToService: true, version: 2 });
    expect(work.status).toBe("COMPLETED"); expect(work.completedBy?.toString()).toBe(admin.id);
    expect(equipment.status).toBe("OPERATIONAL");
    expect(equipment.nextServiceDate).toBe(kind === "PREVENTIVE" ? "2026-02-15" : "2026-01-20");
    expect(EquipmentIncident.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: fault._id, equipment: id }), expect.objectContaining({ $set: expect.objectContaining({ status: "RESOLVED", reviewNotes: "Belt inspected and repaired" }) }), { session, runValidators: true });
  });
  it("cancels work with an explanation without silently making equipment operational", async () => {
    work.status = "IN_PROGRESS"; equipment.status = "UNDER_MAINTENANCE";
    await mutations.transitionWork(admin, id, workId, { action: "CANCEL", reason: "Awaiting replacement parts", version: 2 });
    expect(work.status).toBe("CANCELLED"); expect(work.cancellationReason).toBe("Awaiting replacement parts"); expect(equipment.status).toBe("UNDER_MAINTENANCE");
  });
  it.each(["COMPLETED", "CANCELLED"] as const)("preserves %s work against assignment and lifecycle rewrites", async status => {
    work.status = status;
    await expect(mutations.assignWork(admin, id, workId, { technician: "Other", provider: "", contact: "", estimatedCostLkr: null, version: 2 })).rejects.toHaveProperty("statusCode", 409);
    await expect(mutations.transitionWork(admin, id, workId, { action: "START", version: 3 })).rejects.toHaveProperty("statusCode", 409);
    expect(saved).toHaveLength(0);
  });
});

describe("read-only immutable Finance expense references", () => {
  beforeEach(() => { work.status = "COMPLETED"; });
  it.each(["EQUIPMENT", "MAINTENANCE"])("references a verified %s expense without saving it or creating expenses", async category => {
    vi.mocked(Expense.findById).mockReturnValue(sessionValue(Expense.hydrate({ _id: expenseId, category })));
    const result = await mutations.linkExpense(admin, id, workId, expenseId, 2);
    expect(result.result).toEqual({ linked: true });
    expect(saved.filter(row => row instanceof EquipmentExpenseLink)).toHaveLength(1);
    expect(saved.some(row => row instanceof Expense)).toBe(false);
    expect(MaintenanceWork.findOne).toHaveBeenCalledWith({ _id: workId, equipment: id, status: "COMPLETED" });
  });
  it.each(["missing", "wrong-category", "incomplete-work", "other-work"])("rejects %s expense associations", async condition => {
    if (condition === "missing") vi.mocked(Expense.findById).mockReturnValue(sessionValue(null));
    if (condition === "wrong-category") vi.mocked(Expense.findById).mockReturnValue(sessionValue(Expense.hydrate({ _id: expenseId, category: "RENT" })));
    if (condition === "incomplete-work") vi.mocked(MaintenanceWork.findOne).mockReturnValue(sessionValue(null));
    if (condition === "other-work") vi.mocked(EquipmentExpenseLink.findOne).mockReturnValue(sessionValue({ workOrder: "000000000000000000000999" }));
    await expect(mutations.linkExpense(admin, id, workId, expenseId, 2)).rejects.toHaveProperty("statusCode", condition === "missing" ? 404 : condition === "wrong-category" ? 400 : 409);
    expect(saved).toHaveLength(0);
  });
  it("treats an existing identical reference as a safe replay", async () => {
    vi.mocked(EquipmentExpenseLink.findOne).mockReturnValue(sessionValue({ workOrder: workId }));
    expect((await mutations.linkExpense(admin, id, workId, expenseId, 2)).result).toEqual({ linked: false }); expect(saved).toHaveLength(1); // version save only
    expect(saved[0]).toBeInstanceOf(Equipment);
  });
  it("blocks history mutation at the model hook without a database connection", async () => {
    // Invoke registered middleware directly; Query.exec stays blocked by isolation.
    const hooks = (schema: mongoose.Schema) => (schema as unknown as { s: { hooks: { execPre: (name: string, context: object, args: unknown[]) => Promise<unknown> } } }).s.hooks;
    await expect(hooks(EquipmentEvent.schema).execPre("updateOne", {}, [])).rejects.toThrow("cannot be changed");
    await expect(hooks(EquipmentExpenseLink.schema).execPre("deleteMany", {}, [])).rejects.toThrow("cannot be changed");
  });
});

describe("equipment read boundaries and operational queries", () => {
  it("redacts purchase price, provider, estimates, repair/review notes and expense data for Receptionists", () => {
    expect(service.publicEquipment(equipment, receptionist)).not.toHaveProperty("purchasePriceLkr");
    const result = service.publicWork(work, receptionist);
    for (const field of ["technician", "provider", "contact", "estimatedCostLkr", "notes", "repairNotes", "linkedExpenses"]) expect(result).not.toHaveProperty(field);
    expect(service.publicIncident(fault, receptionist)).not.toHaveProperty("reviewNotes");
    expect(service.publicWork(work, admin)).toHaveProperty("estimatedCostLkr", 5000);
  });
  it("rejects forged Admin grants and explicit deny-all before persistence", async () => {
    const forged = { ...receptionist, permissions: ["equipment.manage", "expenses.manage"] as service.EquipmentActor["permissions"] };
    await expect(mutations.createEquipment(forged, profile())).rejects.toHaveProperty("statusCode", 403);
    await expect(service.listEquipment({ ...receptionist, permissions: [] }, validation.inventoryQuery.parse({}))).rejects.toHaveProperty("statusCode", 403);
    await expect(service.equipmentHistory(receptionist, id, { kind: "events", page: 1, limit: 10 })).rejects.toHaveProperty("statusCode", 403);
    expect(mongoose.connection.transaction).not.toHaveBeenCalled();
  });
  it("escapes search literals and returns bounded pagination/status statistics", async () => {
    const list = query([equipment]); vi.spyOn(Equipment, "find").mockReturnValue(list as never);
    vi.spyOn(Equipment, "countDocuments").mockResolvedValue(11); vi.spyOn(Equipment, "aggregate").mockResolvedValue([{ _id: "OPERATIONAL", count: 12 }]);
    const result = await service.listEquipment(receptionist, validation.inventoryQuery.parse({ q: "belt.*", page: 2, status: "OPERATIONAL", location: "A(1)" }));
    expect(result.statistics).toMatchObject({ total: 12, operational: 12, retired: 0 });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 11, totalPages: 2 });
    expect(list.skip).toHaveBeenCalledWith(10);
    expect(Equipment.find).toHaveBeenCalledWith(expect.objectContaining({ location: { $regex: "A\\(1\\)", $options: "i" }, $or: expect.arrayContaining([{ name: { $regex: "belt\\.\\*", $options: "i" } }]) }));
  });
  it("does not even query Finance when Receptionists read work history", async () => {
    vi.mocked(Equipment.exists).mockResolvedValue({ _id: equipment._id });
    vi.spyOn(MaintenanceWork, "find").mockReturnValue(query([work]) as never); vi.spyOn(MaintenanceWork, "countDocuments").mockResolvedValue(1);
    const expenses = vi.spyOn(Expense, "find");
    const links = vi.spyOn(EquipmentExpenseLink, "find");
    const result = await service.equipmentHistory(receptionist, id, { kind: "work-orders", page: 1, limit: 10 });
    expect(result.data).toHaveLength(1); expect(expenses).not.toHaveBeenCalled(); expect(links).not.toHaveBeenCalled();
  });
  it("uses Colombo today for due queues and excludes retired equipment", async () => {
    vi.spyOn(Equipment, "find").mockReturnValue(query([equipment]) as never);
    vi.spyOn(Equipment, "countDocuments").mockResolvedValue(1); vi.spyOn(MaintenanceWork, "countDocuments").mockResolvedValue(2); vi.spyOn(EquipmentIncident, "countDocuments").mockResolvedValue(3);
    const result = await service.maintenanceDashboard(admin, { page: 1, limit: 10 });
    expect(result.asOfDate).toBe("2026-01-16"); expect(result.statistics.activeWork).toBe(2);
    expect(Equipment.find).toHaveBeenCalledWith({ status: { $ne: "RETIRED" }, nextServiceDate: { $gte: "0001-01-01", $lte: "2026-01-23" } });
  });
});
