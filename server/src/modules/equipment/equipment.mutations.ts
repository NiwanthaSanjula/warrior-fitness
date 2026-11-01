import mongoose, { type ClientSession } from "mongoose";
import type { z } from "zod";
import { AppError } from "../../utils/AppError.js";
import { Expense } from "../financial/expense.model.js";
import { addDays, todayInColombo } from "../memberships/membership.dates.js";
import { Equipment, EquipmentDowntime, EquipmentEvent, EquipmentExpenseLink, EquipmentIncident, MaintenanceWork, type IEquipment } from "./equipment.model.js";
import { equipmentAccess, getEquipment, publicEquipment, publicIncident, publicWork, type EquipmentActor, type EquipmentDocument } from "./equipment.service.js";
import type { assignInput, createEquipmentSchema, incidentInput, reviewInput, statusInput, updateEquipmentSchema, workActionInput, workInput } from "./equipment.validation.js";

const transaction = <T>(work: (session: ClientSession) => Promise<T>) => mongoose.connection.transaction(work, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
async function event(actor: EquipmentActor, equipment: EquipmentDocument, action: string, notes: string, session: ClientSession) {
  await new EquipmentEvent({ equipment: equipment._id, actor: actor.id, actorName: actor.fullName, action, notes, recordedAt: new Date() }).save({ session });
}
async function change<T>(actor: EquipmentActor, id: string, version: number, write: (equipment: EquipmentDocument, session: ClientSession) => Promise<T>, admin = true) {
  equipmentAccess(actor, admin ? ["equipment.manage"] : ["equipment.read", "equipment.report"], admin);
  return transaction(async session => {
    const equipment = await Equipment.findById(id).session(session);
    if (!equipment) throw new AppError(404, "Equipment not found");
    if (equipment.version !== version) throw new AppError(409, "Equipment changed. Refresh before trying again.");
    const lock = await Equipment.updateOne({ _id: id, version }, { $inc: { version: 1 } }, { session });
    if (lock.matchedCount !== 1) throw new AppError(409, "Equipment changed. Refresh before trying again.");
    equipment.version++;
    const result = await write(equipment, session);
    await equipment.save({ session });
    return { equipment: publicEquipment(equipment, actor), result };
  });
}
function live(equipment: EquipmentDocument) { if (equipment.status === "RETIRED") throw new AppError(409, "Retired equipment cannot return to service or accept new incidents/work"); }
export function validateEquipmentTransition(from: IEquipment["status"], to: IEquipment["status"]) {
  if (from === "RETIRED" || from === to) throw new AppError(409, "Invalid equipment status transition");
}
async function availability(equipment: EquipmentDocument, next: IEquipment["status"], reason: string, actor: EquipmentActor, session: ClientSession) {
  validateEquipmentTransition(equipment.status, next);
  if (next === "OPERATIONAL") {
    // A MongoDB transaction session must not run parallel operations.
    const work = await MaintenanceWork.exists({ equipment: equipment._id, status: "IN_PROGRESS" }).session(session);
    const critical = await EquipmentIncident.exists({ equipment: equipment._id, severity: "CRITICAL", status: { $in: ["OPEN", "ACKNOWLEDGED"] } }).session(session);
    if (work || critical) throw new AppError(409, "Finish active work and resolve critical faults before returning to service");
  }
  if (next === "RETIRED" && await MaintenanceWork.exists({ equipment: equipment._id, status: { $in: ["OPEN", "IN_PROGRESS"] } }).session(session)) throw new AppError(409, "Complete or cancel active work before retiring equipment");
  const wasUnavailable = ["UNDER_MAINTENANCE", "OUT_OF_SERVICE"].includes(equipment.status);
  const becomesUnavailable = ["UNDER_MAINTENANCE", "OUT_OF_SERVICE"].includes(next);
  if (!wasUnavailable && becomesUnavailable) await new EquipmentDowntime({ equipment: equipment._id, startedAt: new Date(), reason, recordedBy: actor.id, recordedByName: actor.fullName }).save({ session });
  if (wasUnavailable && !becomesUnavailable) await EquipmentDowntime.updateOne({ equipment: equipment._id, isOpen: true }, { $set: { isOpen: false, endedAt: new Date() } }, { session, runValidators: true });
  const previous = equipment.status; equipment.status = next;
  await event(actor, equipment, "STATUS_CHANGED", `${previous} → ${next}: ${reason}`, session);
}
export async function createEquipment(actor: EquipmentActor, input: z.infer<typeof createEquipmentSchema>) {
  equipmentAccess(actor, ["equipment.manage"], true);
  return transaction(async session => {
    if (await Equipment.exists({ assetId: input.assetId }).session(session)) throw new AppError(409, "This asset ID is already registered");
    const equipment = new Equipment({ ...input, status: "OPERATIONAL", createdBy: actor.id }); await equipment.save({ session });
    await event(actor, equipment, "EQUIPMENT_REGISTERED", "Equipment registered", session); return publicEquipment(equipment, actor);
  });
}
export function updateEquipment(actor: EquipmentActor, id: string, input: z.infer<typeof updateEquipmentSchema>) {
  return change(actor, id, input.version, async (equipment, session) => {
    const { version: _version, ...fields } = input; equipment.set(fields);
    await event(actor, equipment, "PROFILE_UPDATED", "Inventory details and service schedule updated", session);
  });
}
export function setEquipmentStatus(actor: EquipmentActor, id: string, input: z.infer<typeof statusInput>) {
  return change(actor, id, input.version, (equipment, session) => availability(equipment, input.status, input.reason, actor, session));
}
export async function reportIncident(actor: EquipmentActor, id: string, input: z.infer<typeof incidentInput>) {
  equipmentAccess(actor, ["equipment.read", "equipment.report"]);
  // Confirmed duplicates are safe to retry after a lost response, even if the
  // equipment version advanced. The same key cannot target different content.
  const previous = await EquipmentIncident.findOne({ requestId: input.requestId });
  if (previous) {
    if (String(previous.equipment) !== id || String(previous.reportedBy) !== actor.id || previous.description !== input.description || previous.severity !== input.severity) throw new AppError(409, "Fault request key was already used for different details");
    return { equipment: await getEquipment(actor, id), result: publicIncident(previous, actor), replayed: true };
  }
  return change(actor, id, input.version, async (equipment, session) => {
    live(equipment);
    const incident = new EquipmentIncident({ equipment: id, requestId: input.requestId, description: input.description, severity: input.severity, reportedBy: actor.id, reporterName: actor.fullName, reportedAt: new Date() });
    await incident.save({ session }); await event(actor, equipment, "FAULT_REPORTED", `${input.severity} fault reported`, session); return publicIncident(incident, actor);
  }, false);
}
export function reviewIncident(actor: EquipmentActor, equipmentId: string, incidentId: string, input: z.infer<typeof reviewInput>) {
  return change(actor, equipmentId, input.version, async (equipment, session) => {
    const incident = await EquipmentIncident.findOne({ _id: incidentId, equipment: equipmentId }).session(session);
    if (!incident) throw new AppError(404, "Fault report not found on this equipment");
    if (!["OPEN", "ACKNOWLEDGED"].includes(incident.status) || (input.action === "ACKNOWLEDGE" && incident.status !== "OPEN")) throw new AppError(409, "This fault cannot make the requested transition");
    if (input.action !== "ACKNOWLEDGE" && await MaintenanceWork.exists({ incident: incidentId, status: { $in: ["OPEN", "IN_PROGRESS"] } }).session(session)) throw new AppError(409, "Complete or cancel the linked work order before closing this fault");
    incident.status = input.action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : input.action === "RESOLVE" ? "RESOLVED" : "DISMISSED";
    incident.reviewNotes = input.notes; incident.reviewedBy = new mongoose.Types.ObjectId(actor.id);
    if (input.action !== "ACKNOWLEDGE") incident.closedAt = new Date();
    await incident.save({ session }); await event(actor, equipment, `FAULT_${incident.status}`, input.notes, session); return publicIncident(incident, actor);
  });
}
export function createWork(actor: EquipmentActor, equipmentId: string, input: z.infer<typeof workInput>) {
  return change(actor, equipmentId, input.version, async (equipment, session) => {
    live(equipment);
    if (input.incidentId) {
      const incident = await EquipmentIncident.findOne({ _id: input.incidentId, equipment: equipmentId, status: { $in: ["OPEN", "ACKNOWLEDGED"] } }).session(session);
      if (!incident) throw new AppError(400, "Select an unresolved fault from this equipment");
      if (await MaintenanceWork.exists({ incident: input.incidentId, status: { $in: ["OPEN", "IN_PROGRESS"] } }).session(session)) throw new AppError(409, "This fault already has active maintenance work");
    }
    const { incidentId, version: _version, ...fields } = input;
    const work = new MaintenanceWork({ ...fields, equipment: equipmentId, assetId: equipment.assetId, equipmentName: equipment.name, incident: incidentId, createdBy: actor.id, createdByName: actor.fullName, createdAt: new Date() });
    await work.save({ session }); await event(actor, equipment, "WORK_CREATED", input.title, session); return publicWork(work, actor);
  });
}
export function assignWork(actor: EquipmentActor, equipmentId: string, workId: string, input: z.infer<typeof assignInput>) {
  return change(actor, equipmentId, input.version, async (equipment, session) => {
    const work = await MaintenanceWork.findOne({ _id: workId, equipment: equipmentId }).session(session);
    if (!work) throw new AppError(404, "Work order not found");
    if (!["OPEN", "IN_PROGRESS"].includes(work.status)) throw new AppError(409, "Completed/cancelled work assignment is preserved");
    const { version: _version, ...fields } = input; work.set(fields); await work.save({ session }); await event(actor, equipment, "WORK_ASSIGNED", `Assignment updated for ${work.title}`, session); return publicWork(work, actor);
  });
}
export function transitionWork(actor: EquipmentActor, equipmentId: string, workId: string, input: z.infer<typeof workActionInput>) {
  return change(actor, equipmentId, input.version, async (equipment, session) => {
    const work = await MaintenanceWork.findOne({ _id: workId, equipment: equipmentId }).session(session);
    if (!work) throw new AppError(404, "Work order not found");
    if (input.action === "START") {
      live(equipment); if (work.status !== "OPEN") throw new AppError(409, "Only open work can be started");
      if (!(work.technician || work.provider)) throw new AppError(400, "Assign a technician or service provider before starting");
      work.status = "IN_PROGRESS"; work.startedAt = new Date();
      if (equipment.status !== "UNDER_MAINTENANCE") await availability(equipment, "UNDER_MAINTENANCE", `Work started: ${work.title}`, actor, session);
    } else if (input.action === "CANCEL") {
      if (!["OPEN", "IN_PROGRESS"].includes(work.status)) throw new AppError(409, "Only active work can be cancelled");
      work.status = "CANCELLED"; work.cancellationReason = input.reason; work.completedAt = new Date(); work.completedBy = new mongoose.Types.ObjectId(actor.id);
    } else {
      if (work.status !== "IN_PROGRESS") throw new AppError(409, "Only in-progress work can be completed");
      work.status = "COMPLETED"; work.repairNotes = input.repairNotes; work.completedAt = new Date(); work.completedBy = new mongoose.Types.ObjectId(actor.id);
      await work.save({ session });
      if (work.incident) await EquipmentIncident.updateOne({ _id: work.incident, equipment: equipmentId, status: { $in: ["OPEN", "ACKNOWLEDGED"] } }, { $set: { status: "RESOLVED", reviewNotes: input.repairNotes.slice(0, 1500), reviewedBy: actor.id, closedAt: new Date() } }, { session, runValidators: true });
      const nextDate = input.nextServiceDate !== undefined ? input.nextServiceDate : equipment.intervalDays && work.kind === "PREVENTIVE" ? addDays(todayInColombo(), equipment.intervalDays) : equipment.nextServiceDate;
      if (equipment.intervalDays && !nextDate) throw new AppError(400, "A recurring schedule needs a next service date");
      equipment.nextServiceDate = nextDate;
      if (input.returnToService) await availability(equipment, "OPERATIONAL", `Maintenance completed: ${work.title}`, actor, session);
    }
    if (input.action !== "COMPLETE") await work.save({ session });
    await event(actor, equipment, `WORK_${work.status}`, input.action === "COMPLETE" ? input.repairNotes : work.title, session); return publicWork(work, actor);
  });
}
export function linkExpense(actor: EquipmentActor, equipmentId: string, workId: string, expenseId: string, version: number) {
  equipmentAccess(actor, ["equipment.manage", "expenses.manage"], true);
  return change(actor, equipmentId, version, async (equipment, session) => {
    const work = await MaintenanceWork.findOne({ _id: workId, equipment: equipmentId, status: "COMPLETED" }).session(session);
    if (!work) throw new AppError(409, "Expense references may be appended only to completed work on this equipment");
    const expense = await Expense.findById(expenseId).session(session);
    if (!expense) throw new AppError(404, "Existing Finance expense not found");
    if (!["EQUIPMENT", "MAINTENANCE"].includes(expense.category)) throw new AppError(400, "Only EQUIPMENT or MAINTENANCE expenses may be linked");
    const linked = await EquipmentExpenseLink.findOne({ expense: expenseId }).session(session);
    if (linked) {
      if (String(linked.workOrder) === workId) return { linked: false };
      throw new AppError(409, "This expense already belongs to another work order; costs cannot be counted twice");
    }
    await new EquipmentExpenseLink({ equipment: equipmentId, workOrder: workId, expense: expenseId, linkedBy: actor.id, linkedAt: new Date() }).save({ session });
    await event(actor, equipment, "EXPENSE_LINKED", `Existing expense ${expenseId} linked to completed maintenance`, session); return { linked: true };
  });
}
