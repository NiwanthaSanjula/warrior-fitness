import { z } from "zod";
import { PAYMENT_METHODS } from "../billing/payment.model.js";
import { financialDate } from "../financial/financial.validation.js";
import { RETAIL_CATEGORIES } from "./retail.constants.js";
export const retailId = z.string().regex(/^[a-f\d]{24}$/i).toLowerCase();
export const retailVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,79}$/);
const profileFields = {
  sku: code,
  name: z.string().trim().min(2).max(120), barcode: code.nullable().default(null), category: z.enum(RETAIL_CATEGORIES),
  sellingPriceLkr: z.number().int().min(1).max(10_000_000), lowStockThreshold: z.number().int().min(0).max(1_000_000),
  supplierName: z.string().trim().max(160).default(""), supplierContact: z.string().trim().max(160).default(""), isActive: z.boolean(),
};
export const createProductInput = z.strictObject({ ...profileFields, initialStock: z.number().int().min(0).max(1_000_000) });
export const updateProductInput = z.strictObject({ ...profileFields, version: retailVersion });
export const stockInput = z.strictObject({
  requestId: z.uuid(), kind: z.enum(["RESTOCK", "ADJUSTMENT"]), change: z.number().int().min(-1_000_000).max(1_000_000).refine(v => v !== 0, "Stock change cannot be zero"),
  reason: z.string().trim().min(5).max(500), version: retailVersion,
}).refine(v => v.kind !== "RESTOCK" || v.change > 0, "Restocking must add stock");
export const checkoutInput = z.strictObject({
  requestId: z.uuid(), items: z.array(z.strictObject({ productId: retailId, quantity: z.number().int().min(1).max(1000), expectedUnitPriceLkr: z.number().int().min(1).max(10_000_000) })).min(1).max(50),
  expectedTotalLkr: z.number().int().min(1).max(1_000_000_000), method: z.enum(PAYMENT_METHODS),
  cashTenderedLkr: z.number().int().min(1).max(1_000_000_000).nullable().default(null),
  memberId: retailId.nullable().default(null), reference: z.string().trim().max(80).default(""),
}).refine(v => new Set(v.items.map(item => item.productId)).size === v.items.length, "Combine duplicate products into one cart line")
  .refine(v => v.method === "CASH" ? v.cashTenderedLkr !== null : v.cashTenderedLkr === null, "Cash requires a tendered amount; other methods must not supply cash");
const pages = { page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(50).default(12) };
export const productQuery = z.strictObject({ ...pages, q: z.string().trim().max(100).default(""), barcode: code.optional(), sku: code.optional(), category: z.enum(RETAIL_CATEGORIES).optional(), status: z.enum(["active", "inactive", "all"]).default("active"), stock: z.enum(["in", "low", "out"]).optional() });
export const movementQuery = z.strictObject(pages);
export const saleQuery = z.strictObject({ ...pages, from: financialDate.optional(), to: financialDate.optional(), method: z.enum(PAYMENT_METHODS).optional(), q: z.string().trim().max(100).default("") });
export const reportQuery = z.strictObject({ from: financialDate.optional(), to: financialDate.optional() });
export type CheckoutInput = z.infer<typeof checkoutInput>;
