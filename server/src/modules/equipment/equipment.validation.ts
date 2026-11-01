import { z } from "zod";
import { todayInColombo } from "../memberships/membership.dates.js";
import { EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, INCIDENT_STATUSES, SEVERITIES, WORK_KINDS, WORK_STATUSES } from "./equipment.constants.js";
export const equipmentId = z.string().regex(/^[a-f\d]{24}$/i).toLowerCase();
const date = z.iso.date();
const text = (max: number) => z.string().trim().max(max).default("");
export const equipmentFields = {
  name: z.string().trim().min(2).max(120), category: z.enum(EQUIPMENT_CATEGORIES), brand: text(100), model: text(100), serialNumber: text(120), location: z.string().trim().min(2).max(100),
  purchaseDate: date.nullable().default(null), purchasePriceLkr: z.number().int().min(0).max(1_000_000_000).nullable().default(null), warrantyExpiry: date.nullable().default(null),
  intervalDays: z.number().int().min(1).max(3650).nullable().default(null), nextServiceDate: date.nullable().default(null),
};
const validProfile = (input: { purchaseDate: string | null; warrantyExpiry: string | null; intervalDays: number | null; nextServiceDate: string | null }) =>
  (!input.purchaseDate || input.purchaseDate <= todayInColombo()) && (!input.purchaseDate || !input.warrantyExpiry || input.warrantyExpiry >= input.purchaseDate) && (input.intervalDays === null || input.nextServiceDate !== null);
export const createEquipmentSchema = z.strictObject({ assetId: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/), ...equipmentFields }).refine(validProfile, "Purchase date cannot be future, warranty cannot precede purchase, and recurring service needs a next date");
export const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const updateEquipmentSchema = z.strictObject({ ...equipmentFields, version }).refine(validProfile, "Invalid equipment dates or recurring service schedule");
export const statusInput = z.strictObject({ status: z.enum(EQUIPMENT_STATUSES), reason: z.string().trim().min(5).max(1500), version });
export const incidentInput = z.strictObject({ requestId: z.uuid(), description: z.string().trim().min(10).max(1500), severity: z.enum(SEVERITIES), version });
export const reviewInput = z.strictObject({ action: z.enum(["ACKNOWLEDGE", "RESOLVE", "DISMISS"]), notes: z.string().trim().min(5).max(1500), version });
export const assignmentFields = { technician: text(120), provider: text(160), contact: text(160), estimatedCostLkr: z.number().int().min(0).max(100_000_000).nullable().default(null) };
export const workInput = z.strictObject({ title: z.string().trim().min(5).max(160), kind: z.enum(WORK_KINDS), plannedDate: date, incidentId: equipmentId.nullable().default(null), notes: text(2000), ...assignmentFields, version });
export const assignInput = z.strictObject({ ...assignmentFields, version }).refine(input => !!(input.technician || input.provider), "Supply a technician or service provider");
export const workActionInput = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("START"), version }),
  z.strictObject({ action: z.literal("COMPLETE"), repairNotes: z.string().trim().min(10).max(2000), returnToService: z.boolean(), nextServiceDate: date.nullable().optional(), version }).refine(input => !input.nextServiceDate || input.nextServiceDate > todayInColombo(), "Next service must be after today"),
  z.strictObject({ action: z.literal("CANCEL"), reason: z.string().trim().min(5).max(1500), version }),
]);
export const expenseLinkInput = z.strictObject({ expenseId: equipmentId, version });
const pagination = { page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(50).default(10) };
export const inventoryQuery = z.strictObject({ ...pagination, q: z.string().trim().max(100).default(""), status: z.enum(EQUIPMENT_STATUSES).optional(), category: z.enum(EQUIPMENT_CATEGORIES).optional(), location: z.string().trim().max(100).optional() });
export const historyQuery = z.strictObject({ ...pagination, kind: z.enum(["incidents", "work-orders", "downtime", "events"]) });
export const workQuery = z.strictObject({ ...pagination, status: z.enum(WORK_STATUSES).optional() });
export const incidentQuery = z.strictObject({ ...pagination, status: z.enum(INCIDENT_STATUSES).optional(), severity: z.enum(SEVERITIES).optional() });
export const maintenanceQuery = z.strictObject(pagination);
