import type { HydratedDocument, Types } from "mongoose";
import type { z } from "zod";
import type { Permission } from "../auth/permissions.js";
import { AppError } from "../../utils/AppError.js";
import { Expense } from "../financial/expense.model.js";
import { addDays, todayInColombo } from "../memberships/membership.dates.js";
import { Equipment, EquipmentDowntime, EquipmentEvent, EquipmentExpenseLink, EquipmentIncident, MaintenanceWork, type IEquipment, type IIncident, type IWorkOrder } from "./equipment.model.js";
import type { historyQuery, incidentQuery, inventoryQuery, maintenanceQuery, workQuery } from "./equipment.validation.js";

export type EquipmentActor = { id: string; fullName: string; role: "ADMIN" | "RECEPTIONIST"; permissions: Permission[] };
export function equipmentAccess(actor: EquipmentActor, permissions: Permission[], admin = false) {
  if (actor.role === "ADMIN") return;
  if (admin || !permissions.every(key => actor.permissions.includes(key))) throw new AppError(403, "You do not have permission for this equipment operation");
}
type Identified<T> = T & { _id: Types.ObjectId };
export function publicEquipment(item: Identified<IEquipment>, actor: EquipmentActor) {
  return { id: String(item._id), assetId: item.assetId, name: item.name, category: item.category, brand: item.brand, model: item.model, serialNumber: item.serialNumber,
    location: item.location, purchaseDate: item.purchaseDate, warrantyExpiry: item.warrantyExpiry, status: item.status,
    intervalDays: item.intervalDays, nextServiceDate: item.nextServiceDate, version: item.version,
    ...(actor.role === "ADMIN" ? { purchasePriceLkr: item.purchasePriceLkr } : {}) };
}
export function publicIncident(item: Identified<IIncident>, actor: EquipmentActor) {
  return { id: String(item._id), equipmentId: String(item.equipment), description: item.description, severity: item.severity, status: item.status,
    reporterName: item.reporterName, reportedAt: item.reportedAt.toISOString(), closedAt: item.closedAt?.toISOString() ?? null,
    ...(actor.role === "ADMIN" ? { reviewNotes: item.reviewNotes } : {}) };
}
type LinkedExpense = { id: string; category: string; description: string; amountLkr: number; expenseDate: string };
export function publicWork(item: Identified<IWorkOrder>, actor: EquipmentActor, expenses: LinkedExpense[] = []) {
  return { id: String(item._id), equipmentId: String(item.equipment), assetId: item.assetId, equipmentName: item.equipmentName, incidentId: item.incident ? String(item.incident) : null,
    title: item.title, kind: item.kind, status: item.status, plannedDate: item.plannedDate, createdAt: item.createdAt.toISOString(), createdByName: item.createdByName,
    startedAt: item.startedAt?.toISOString() ?? null, completedAt: item.completedAt?.toISOString() ?? null,
    ...(actor.role === "ADMIN" ? { technician: item.technician, provider: item.provider, contact: item.contact, estimatedCostLkr: item.estimatedCostLkr,
      notes: item.notes, repairNotes: item.repairNotes, cancellationReason: item.cancellationReason, linkedExpenses: expenses } : {}) };
}
async function workDtos(items: Identified<IWorkOrder>[], actor: EquipmentActor) {
  if (actor.role !== "ADMIN" || !items.length) return items.map(item => publicWork(item, actor));
  const links = await EquipmentExpenseLink.find({ workOrder: { $in: items.map(item => item._id) } }).lean();
  const expenses = links.length ? await Expense.find({ _id: { $in: links.map(link => link.expense) } }).select("category description amountLkr expenseDate").lean() : [];
  const byId = new Map(expenses.map(expense => [String(expense._id), { id: String(expense._id), category: expense.category, description: expense.description, amountLkr: expense.amountLkr, expenseDate: expense.expenseDate }]));
  return items.map(item => publicWork(item, actor, links.filter(link => String(link.workOrder) === String(item._id)).flatMap(link => { const expense = byId.get(String(link.expense)); return expense ? [expense] : []; })));
}
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pagination = (total: number, query: { page: number; limit: number }) => ({ ...query, total, totalPages: Math.ceil(total / query.limit) });
export async function listEquipment(actor: EquipmentActor, query: z.infer<typeof inventoryQuery>) {
  equipmentAccess(actor, ["equipment.read"]);
  const filter: Record<string, unknown> = {};
  if (query.q) filter.$or = ["assetId", "name", "brand", "model", "serialNumber", "location"].map(field => ({ [field]: { $regex: escape(query.q), $options: "i" } }));
  if (query.status) filter.status = query.status; if (query.category) filter.category = query.category;
  if (query.location) filter.location = { $regex: escape(query.location), $options: "i" };
  const [items, total, counts] = await Promise.all([
    Equipment.find(filter).sort({ assetId: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), Equipment.countDocuments(filter),
    Equipment.aggregate<{ _id: IEquipment["status"]; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  return { data: items.map(item => publicEquipment(item, actor)), pagination: pagination(total, { page: query.page, limit: query.limit }), statistics: {
    total: counts.reduce((sum, row) => sum + row.count, 0), operational: counts.find(row => row._id === "OPERATIONAL")?.count ?? 0,
    underMaintenance: counts.find(row => row._id === "UNDER_MAINTENANCE")?.count ?? 0, outOfService: counts.find(row => row._id === "OUT_OF_SERVICE")?.count ?? 0, retired: counts.find(row => row._id === "RETIRED")?.count ?? 0,
  } };
}
export async function getEquipment(actor: EquipmentActor, id: string) {
  equipmentAccess(actor, ["equipment.read"]); const item = await Equipment.findById(id);
  if (!item) throw new AppError(404, "Equipment not found"); return publicEquipment(item, actor);
}
export async function equipmentHistory(actor: EquipmentActor, id: string, query: z.infer<typeof historyQuery>) {
  equipmentAccess(actor, ["equipment.read"], query.kind === "events");
  if (!(await Equipment.exists({ _id: id }))) throw new AppError(404, "Equipment not found");
  const filter = { equipment: id }, skip = (query.page - 1) * query.limit;
  if (query.kind === "incidents") {
    const [items, total] = await Promise.all([EquipmentIncident.find(filter).sort({ reportedAt: -1, _id: -1 }).skip(skip).limit(query.limit).lean(), EquipmentIncident.countDocuments(filter)]);
    return { data: items.map(item => publicIncident(item, actor)), pagination: pagination(total, { page: query.page, limit: query.limit }) };
  }
  if (query.kind === "work-orders") {
    const [items, total] = await Promise.all([MaintenanceWork.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(query.limit).lean(), MaintenanceWork.countDocuments(filter)]);
    return { data: await workDtos(items, actor), pagination: pagination(total, { page: query.page, limit: query.limit }) };
  }
  if (query.kind === "downtime") {
    const [items, total] = await Promise.all([EquipmentDowntime.find(filter).sort({ startedAt: -1, _id: -1 }).skip(skip).limit(query.limit).lean(), EquipmentDowntime.countDocuments(filter)]);
    return { data: items.map(item => ({ id: String(item._id), startedAt: item.startedAt.toISOString(), endedAt: item.endedAt?.toISOString() ?? null, isOpen: item.isOpen,
      reason: item.reason, recordedByName: item.recordedByName, durationMinutes: Math.max(0, Math.floor(((item.endedAt?.getTime() ?? Date.now()) - item.startedAt.getTime()) / 60000)) })), pagination: pagination(total, { page: query.page, limit: query.limit }) };
  }
  const [items, total] = await Promise.all([EquipmentEvent.find(filter).sort({ recordedAt: -1, _id: -1 }).skip(skip).limit(query.limit).lean(), EquipmentEvent.countDocuments(filter)]);
  return { data: items.map(item => ({ id: String(item._id), action: item.action, notes: item.notes, actorName: item.actorName, recordedAt: item.recordedAt.toISOString() })), pagination: pagination(total, { page: query.page, limit: query.limit }) };
}
export async function listWorkOrders(actor: EquipmentActor, query: z.infer<typeof workQuery>) {
  equipmentAccess(actor, ["equipment.manage"], true); const filter = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([MaintenanceWork.find(filter).sort({ plannedDate: 1, _id: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), MaintenanceWork.countDocuments(filter)]);
  return { data: await workDtos(items, actor), pagination: pagination(total, { page: query.page, limit: query.limit }) };
}
export async function listIncidents(actor: EquipmentActor, query: z.infer<typeof incidentQuery>) {
  equipmentAccess(actor, ["equipment.manage"], true);
  const filter = { ...(query.status ? { status: query.status } : {}), ...(query.severity ? { severity: query.severity } : {}) };
  const [items, total] = await Promise.all([EquipmentIncident.find(filter).sort({ reportedAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), EquipmentIncident.countDocuments(filter)]);
  return { data: items.map(item => publicIncident(item, actor)), pagination: pagination(total, { page: query.page, limit: query.limit }) };
}
export async function maintenanceDashboard(actor: EquipmentActor, query: z.infer<typeof maintenanceQuery>) {
  equipmentAccess(actor, ["equipment.manage"], true); const today = todayInColombo();
  const active = { status: { $ne: "RETIRED" as const } }, filter = { ...active, nextServiceDate: { $gte: "0001-01-01", $lte: addDays(today, 7) } };
  const [overdue, dueToday, activeWork, openIncidents, unavailable, queue, total] = await Promise.all([
    Equipment.countDocuments({ ...active, nextServiceDate: { $gte: "0001-01-01", $lt: today } }), Equipment.countDocuments({ ...active, nextServiceDate: today }),
    MaintenanceWork.countDocuments({ status: { $in: ["OPEN", "IN_PROGRESS"] } }), EquipmentIncident.countDocuments({ status: { $in: ["OPEN", "ACKNOWLEDGED"] } }),
    Equipment.countDocuments({ status: { $in: ["UNDER_MAINTENANCE", "OUT_OF_SERVICE"] } }), Equipment.find(filter).sort({ nextServiceDate: 1, assetId: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(), Equipment.countDocuments(filter),
  ]);
  return { asOfDate: today, statistics: { overdue, dueToday, activeWork, openIncidents, unavailable }, queue: queue.map(item => publicEquipment(item, actor)), pagination: pagination(total, { page: query.page, limit: query.limit }) };
}
export type EquipmentDocument = HydratedDocument<IEquipment>;
