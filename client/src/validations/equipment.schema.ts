import { z } from "zod";
import { todayInColombo } from "../utils/dashboard";
const optionalText = (max: number) => z.string().trim().max(max);
const date = z.iso.date().nullable();
export const equipmentProfileSchema = z.object({
  name: z.string().trim().min(2).max(120), category: z.enum(["CARDIO", "STRENGTH", "FREE_WEIGHTS", "FUNCTIONAL", "ACCESSORIES", "OTHER"]),
  brand: optionalText(100), model: optionalText(100), serialNumber: optionalText(120), location: z.string().trim().min(2).max(100),
  purchaseDate: date, purchasePriceLkr: z.number().int().min(0).max(1_000_000_000).nullable(), warrantyExpiry: date,
  intervalDays: z.number().int().min(1).max(3650).nullable(), nextServiceDate: date,
}).refine(input => (!input.purchaseDate || input.purchaseDate <= todayInColombo()) && (!input.purchaseDate || !input.warrantyExpiry || input.warrantyExpiry >= input.purchaseDate) && (input.intervalDays === null || input.nextServiceDate !== null), "Check purchase/warranty dates; a recurring schedule requires a next service date");
export const assetIdSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/, "Use 3–40 letters, numbers and hyphens for the asset ID");
export const faultSchema = z.object({ description: z.string().trim().min(10).max(1500), severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]) });
export const assignmentSchema = z.object({ technician: optionalText(120), provider: optionalText(160), contact: optionalText(160), estimatedCostLkr: z.number().int().min(0).max(100_000_000).nullable() });
export const workSchema = assignmentSchema.extend({ title: z.string().trim().min(5).max(160), kind: z.enum(["PREVENTIVE", "REPAIR"]), plannedDate: z.iso.date(), incidentId: z.string().regex(/^[a-f\d]{24}$/i).nullable(), notes: optionalText(2000) });
