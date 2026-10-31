import mongoose, { Schema, type Types } from "mongoose";
import { appendOnly } from "./append-only.js";

export interface MethodAmounts { CASH: number; BANK_TRANSFER: number; CARD: number }
export interface DayTotals {
  collections: MethodAmounts; expenses: MethodAmounts;
  paymentCount: number; expenseCount: number;
}
export interface ICashClosing {
  date: string; requestId: string; fingerprint: string; expectedRevision: number;
  openingCashLkr: number; actualCashLkr: number; expectedCashLkr: number; varianceLkr: number;
  explanation: string; totals: DayTotals;
  closedBy: Types.ObjectId; closedByName: string; createdAt: Date;
}
const methodSchema = new Schema<MethodAmounts>({
  CASH: { type: Number, required: true }, BANK_TRANSFER: { type: Number, required: true }, CARD: { type: Number, required: true },
}, { _id: false });
const totalsSchema = new Schema<DayTotals>({
  collections: { type: methodSchema, required: true }, expenses: { type: methodSchema, required: true },
  paymentCount: { type: Number, required: true }, expenseCount: { type: Number, required: true },
}, { _id: false });
const schema = new Schema<ICashClosing>({
  date: { type: String, required: true, unique: true, immutable: true },
  requestId: { type: String, required: true, unique: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true },
  expectedRevision: { type: Number, required: true, immutable: true },
  openingCashLkr: { type: Number, required: true, min: 0, max: 1_000_000_000, validate: Number.isSafeInteger, immutable: true },
  actualCashLkr: { type: Number, required: true, min: 0, max: 1_000_000_000, validate: Number.isSafeInteger, immutable: true },
  expectedCashLkr: { type: Number, required: true, validate: Number.isSafeInteger, immutable: true },
  varianceLkr: { type: Number, required: true, validate: Number.isSafeInteger, immutable: true },
  explanation: { type: String, default: "", maxlength: 500, immutable: true },
  totals: { type: totalsSchema, required: true, immutable: true },
  closedBy: { type: Schema.Types.ObjectId, ref: "Staff", required: true, immutable: true },
  closedByName: { type: String, required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.plugin(appendOnly);
export const CashClosing = mongoose.model<ICashClosing>("CashClosing", schema);
export function publicClosing(value: ICashClosing & { _id: Types.ObjectId }) {
  return {
    id: value._id.toString(), date: value.date, currency: "LKR" as const, timezone: "Asia/Colombo" as const,
    openingCashLkr: value.openingCashLkr, actualCashLkr: value.actualCashLkr,
    expectedCashLkr: value.expectedCashLkr, varianceLkr: value.varianceLkr,
    explanation: value.explanation, totals: value.totals,
    closedById: value.closedBy.toString(), closedByName: value.closedByName, closedAt: value.createdAt.toISOString(),
  };
}
