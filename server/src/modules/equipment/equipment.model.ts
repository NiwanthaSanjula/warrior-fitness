import mongoose, { Schema, type Types } from "mongoose";
import { AppError } from "../../utils/AppError.js";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, INCIDENT_STATUSES, SEVERITIES, WORK_KINDS, WORK_STATUSES } from "./equipment.constants.js";

export interface IEquipment {
  assetId: string; name: string; category: typeof EQUIPMENT_CATEGORIES[number]; brand: string; model: string; serialNumber: string; location: string;
  purchaseDate: string | null; purchasePriceLkr: number | null; warrantyExpiry: string | null;
  status: typeof EQUIPMENT_STATUSES[number]; intervalDays: number | null; nextServiceDate: string | null;
  version: number; createdBy: Types.ObjectId; createdAt: Date;
}
const text = (max: number) => ({ type: String, trim: true, maxlength: max, default: "" });
const id = (ref: string) => ({ type: Schema.Types.ObjectId, ref, required: true });
const equipmentSchema = new Schema<IEquipment>({
  assetId: { type: String, required: true, unique: true, uppercase: true, trim: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 120 }, category: { type: String, enum: EQUIPMENT_CATEGORIES, required: true },
  brand: text(100), model: text(100), serialNumber: text(120), location: { type: String, required: true, trim: true, maxlength: 100 },
  purchaseDate: { type: String, default: null }, purchasePriceLkr: { type: Number, min: 0, max: 1_000_000_000, validate: v => v === null || Number.isSafeInteger(v), default: null },
  warrantyExpiry: { type: String, default: null }, status: { type: String, enum: EQUIPMENT_STATUSES, default: "OPERATIONAL" },
  intervalDays: { type: Number, min: 1, max: 3650, default: null }, nextServiceDate: { type: String, default: null },
  version: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger }, createdBy: id("Staff"),
}, { timestamps: true, strict: "throw" });
equipmentSchema.index({ status: 1, nextServiceDate: 1 }); equipmentSchema.index({ category: 1, location: 1 });
export const Equipment = mongoose.model<IEquipment>("Equipment", equipmentSchema);

export interface IIncident {
  equipment: Types.ObjectId; requestId: string; description: string; severity: typeof SEVERITIES[number]; status: typeof INCIDENT_STATUSES[number];
  reportedBy: Types.ObjectId; reporterName: string; reportedAt: Date; reviewedBy?: Types.ObjectId | null; reviewNotes: string; closedAt: Date | null;
}
const incidentSchema = new Schema<IIncident>({
  equipment: id("Equipment"), requestId: { type: String, required: true, unique: true, immutable: true },
  description: { type: String, required: true, maxlength: 1500, immutable: true }, severity: { type: String, enum: SEVERITIES, required: true, immutable: true },
  status: { type: String, enum: INCIDENT_STATUSES, default: "OPEN" }, reportedBy: id("Staff"), reporterName: { type: String, required: true },
  reportedAt: { type: Date, required: true }, reviewedBy: { type: Schema.Types.ObjectId, ref: "Staff", default: null }, reviewNotes: text(1500), closedAt: { type: Date, default: null },
}, { strict: "throw" });
incidentSchema.index({ equipment: 1, reportedAt: -1 }); incidentSchema.index({ status: 1, severity: 1 });
export const EquipmentIncident = mongoose.model<IIncident>("EquipmentIncident", incidentSchema);

export interface IWorkOrder {
  equipment: Types.ObjectId; assetId: string; equipmentName: string; incident: Types.ObjectId | null; title: string; kind: typeof WORK_KINDS[number]; status: typeof WORK_STATUSES[number];
  plannedDate: string; technician: string; provider: string; contact: string; estimatedCostLkr: number | null;
  notes: string; repairNotes: string; createdBy: Types.ObjectId; createdByName: string; createdAt: Date;
  startedAt: Date | null; completedAt: Date | null; completedBy: Types.ObjectId | null; cancellationReason: string;
}
const workSchema = new Schema<IWorkOrder>({
  equipment: id("Equipment"), assetId: { type: String, required: true }, equipmentName: { type: String, required: true },
  incident: { type: Schema.Types.ObjectId, ref: "EquipmentIncident", default: null }, title: { type: String, required: true, maxlength: 160 },
  kind: { type: String, enum: WORK_KINDS, required: true }, status: { type: String, enum: WORK_STATUSES, default: "OPEN" }, plannedDate: { type: String, required: true },
  technician: text(120), provider: text(160), contact: text(160), estimatedCostLkr: { type: Number, min: 0, max: 100_000_000, default: null, validate: v => v === null || Number.isSafeInteger(v) },
  notes: text(2000), repairNotes: text(2000), createdBy: id("Staff"), createdByName: { type: String, required: true }, createdAt: { type: Date, required: true },
  startedAt: { type: Date, default: null }, completedAt: { type: Date, default: null }, completedBy: { type: Schema.Types.ObjectId, ref: "Staff", default: null }, cancellationReason: text(1500),
}, { strict: "throw" });
workSchema.index({ equipment: 1, createdAt: -1 }); workSchema.index({ status: 1, plannedDate: 1 });
export const MaintenanceWork = mongoose.model<IWorkOrder>("MaintenanceWork", workSchema);

export interface IDowntime { equipment: Types.ObjectId; startedAt: Date; endedAt: Date | null; isOpen: boolean; reason: string; recordedBy: Types.ObjectId; recordedByName: string }
const downtimeSchema = new Schema<IDowntime>({ equipment: id("Equipment"), startedAt: { type: Date, required: true }, endedAt: { type: Date, default: null }, isOpen: { type: Boolean, default: true }, reason: { type: String, required: true, maxlength: 1500 }, recordedBy: id("Staff"), recordedByName: { type: String, required: true } }, { strict: "throw" });
downtimeSchema.index({ equipment: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });
downtimeSchema.index({ equipment: 1, startedAt: -1 });
export const EquipmentDowntime = mongoose.model<IDowntime>("EquipmentDowntime", downtimeSchema);

export interface IEquipmentEvent { equipment: Types.ObjectId; actor: Types.ObjectId; actorName: string; action: string; notes: string; recordedAt: Date }
const eventSchema = new Schema<IEquipmentEvent>({ equipment: id("Equipment"), actor: id("Staff"), actorName: { type: String, required: true }, action: { type: String, required: true }, notes: text(2000), recordedAt: { type: Date, required: true } }, { strict: "throw" });
function immutable(): never { throw new AppError(409, "Equipment history cannot be changed or deleted"); }
function appendOnly(schema: Schema) {
  schema.pre("save", function () { if (!this.isNew) immutable(); });
  schema.pre(["updateOne", "updateMany", "replaceOne", "findOneAndUpdate", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"], immutable);
  schema.pre("deleteOne", { document: true, query: false }, immutable); schema.pre("bulkWrite", immutable);
}
eventSchema.plugin(appendOnly); eventSchema.index({ equipment: 1, recordedAt: -1 });
export const EquipmentEvent = mongoose.model<IEquipmentEvent>("EquipmentEvent", eventSchema);

export interface IEquipmentExpenseLink { equipment: Types.ObjectId; workOrder: Types.ObjectId; expense: Types.ObjectId; linkedBy: Types.ObjectId; linkedAt: Date }
const linkSchema = new Schema<IEquipmentExpenseLink>({ equipment: id("Equipment"), workOrder: id("MaintenanceWork"), expense: { ...id("Expense"), unique: true, immutable: true }, linkedBy: id("Staff"), linkedAt: { type: Date, required: true } }, { strict: "throw" });
linkSchema.plugin(appendOnly); linkSchema.index({ workOrder: 1 });
export const EquipmentExpenseLink = mongoose.model<IEquipmentExpenseLink>("EquipmentExpenseLink", linkSchema);
export async function initializeEquipmentModels() {
  await Promise.all([Equipment.init(), EquipmentIncident.init(), MaintenanceWork.init(), EquipmentDowntime.init(), EquipmentEvent.init(), EquipmentExpenseLink.init()]);
}
