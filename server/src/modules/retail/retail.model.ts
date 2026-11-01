import mongoose, { Schema, type Types } from "mongoose";
import { appendOnly } from "../financial/append-only.js";
import { PAYMENT_METHODS, type PaymentMethod } from "../billing/payment.model.js";
import { MAX_STOCK, RETAIL_CATEGORIES, STOCK_KINDS } from "./retail.constants.js";

export interface IRetailProduct {
  name: string; sku: string; barcode: string | null; category: typeof RETAIL_CATEGORIES[number];
  sellingPriceLkr: number; stock: number; lowStockThreshold: number;
  supplierName: string; supplierContact: string; isActive: boolean; version: number;
  createdBy: Types.ObjectId; createdAt: Date; updatedAt: Date;
}
const whole = (min: number, max: number) => ({ type: Number, required: true, min, max, validate: Number.isSafeInteger });
const productSchema = new Schema<IRetailProduct>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  sku: { type: String, required: true, uppercase: true, trim: true, unique: true },
  barcode: { type: String, uppercase: true, trim: true, default: null, maxlength: 80 },
  category: { type: String, required: true, enum: RETAIL_CATEGORIES },
  sellingPriceLkr: whole(1, 10_000_000), stock: whole(0, MAX_STOCK), lowStockThreshold: whole(0, 1_000_000),
  supplierName: { type: String, default: "", maxlength: 160 }, supplierContact: { type: String, default: "", maxlength: 160 },
  isActive: { type: Boolean, default: true }, version: { ...whole(0, Number.MAX_SAFE_INTEGER), default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: "Staff", required: true, immutable: true },
}, { timestamps: true, strict: "throw" });
productSchema.index({ barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: "string" } } });
productSchema.index({ isActive: 1, category: 1, name: 1 });
export const RetailProduct = mongoose.model<IRetailProduct>("RetailProduct", productSchema);

export interface RetailSaleLine {
  product: Types.ObjectId; name: string; sku: string; barcode: string | null;
  quantity: number; unitPriceLkr: number; lineTotalLkr: number;
}
export interface IRetailSale {
  saleNumber: string; requestId: string; fingerprint: string; lines: RetailSaleLine[];
  amountLkr: number; method: PaymentMethod; cashTenderedLkr: number | null; changeLkr: number; reference: string;
  member: Types.ObjectId | null; memberName: string; memberReference: string;
  cashier: Types.ObjectId; cashierName: string; soldAt: Date; date: string;
}
const lineSchema = new Schema<RetailSaleLine>({
  product: { type: Schema.Types.ObjectId, ref: "RetailProduct", required: true },
  name: { type: String, required: true }, sku: { type: String, required: true }, barcode: { type: String, default: null },
  quantity: whole(1, 1000), unitPriceLkr: whole(1, 10_000_000), lineTotalLkr: whole(1, 1_000_000_000),
}, { _id: false, strict: "throw" });
const saleSchema = new Schema<IRetailSale>({
  saleNumber: { type: String, required: true, unique: true, immutable: true },
  requestId: { type: String, required: true, unique: true, immutable: true }, fingerprint: { type: String, required: true, immutable: true },
  lines: { type: [lineSchema], required: true, immutable: true, validate: (v: RetailSaleLine[]) => v.length >= 1 && v.length <= 50 },
  amountLkr: { ...whole(1, 1_000_000_000), immutable: true }, method: { type: String, enum: PAYMENT_METHODS, required: true, immutable: true },
  cashTenderedLkr: { type: Number, default: null, min: 0, max: 1_000_000_000, validate: v => v === null || Number.isSafeInteger(v), immutable: true },
  changeLkr: { ...whole(0, 1_000_000_000), immutable: true }, reference: { type: String, default: "", maxlength: 80, immutable: true },
  member: { type: Schema.Types.ObjectId, ref: "Member", default: null, immutable: true },
  memberName: { type: String, default: "", immutable: true }, memberReference: { type: String, default: "", immutable: true },
  cashier: { type: Schema.Types.ObjectId, ref: "Staff", required: true, immutable: true }, cashierName: { type: String, required: true, immutable: true },
  soldAt: { type: Date, required: true, immutable: true }, date: { type: String, required: true, immutable: true },
}, { strict: "throw" });
saleSchema.plugin(appendOnly);
saleSchema.index({ date: 1, method: 1 }); saleSchema.index({ cashier: 1, soldAt: -1 });
export const RetailSale = mongoose.model<IRetailSale>("RetailSale", saleSchema);

export interface IStockMovement {
  product: Types.ObjectId; sku: string; productName: string; kind: typeof STOCK_KINDS[number];
  change: number; before: number; after: number; reason: string; actor: Types.ObjectId; actorName: string;
  sale: Types.ObjectId | null; requestKey: string; fingerprint: string; recordedAt: Date;
}
const movementSchema = new Schema<IStockMovement>({
  product: { type: Schema.Types.ObjectId, ref: "RetailProduct", required: true }, sku: { type: String, required: true }, productName: { type: String, required: true },
  kind: { type: String, enum: STOCK_KINDS, required: true }, change: whole(-MAX_STOCK, MAX_STOCK), before: whole(0, MAX_STOCK), after: whole(0, MAX_STOCK),
  reason: { type: String, required: true, maxlength: 500 }, actor: { type: Schema.Types.ObjectId, ref: "Staff", required: true }, actorName: { type: String, required: true },
  sale: { type: Schema.Types.ObjectId, ref: "RetailSale", default: null }, requestKey: { type: String, required: true, unique: true }, fingerprint: { type: String, required: true }, recordedAt: { type: Date, required: true },
}, { strict: "throw" });
movementSchema.plugin(appendOnly); movementSchema.index({ product: 1, recordedAt: -1 });
export const StockMovement = mongoose.model<IStockMovement>("StockMovement", movementSchema);
export async function initializeRetailModels() { await Promise.all([RetailProduct.init(), RetailSale.init(), StockMovement.init()]); }
