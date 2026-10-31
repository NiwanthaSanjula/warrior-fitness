import mongoose, { Schema, type Types } from "mongoose";
import { PAYMENT_METHODS, type PaymentMethod } from "../billing/payment.model.js";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./financial.constants.js";
import { appendOnly } from "./append-only.js";

export interface IExpense {
  requestId: string; fingerprint: string;
  category: ExpenseCategory; description: string; amountLkr: number;
  method: PaymentMethod; expenseDate: string; reference: string;
  responsibleStaff: Types.ObjectId; responsibleStaffName: string; createdAt: Date;
}
const schema = new Schema<IExpense>({
  requestId: { type: String, required: true, unique: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true },
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true, immutable: true },
  description: { type: String, required: true, maxlength: 300, immutable: true },
  amountLkr: { type: Number, required: true, min: 1, max: 10_000_000, validate: Number.isSafeInteger, immutable: true },
  method: { type: String, enum: PAYMENT_METHODS, required: true, immutable: true },
  expenseDate: { type: String, required: true, immutable: true },
  reference: { type: String, default: "", maxlength: 80, immutable: true },
  responsibleStaff: { type: Schema.Types.ObjectId, ref: "Staff", required: true, immutable: true },
  responsibleStaffName: { type: String, required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ expenseDate: -1, _id: -1 });
schema.plugin(appendOnly);
export const Expense = mongoose.model<IExpense>("Expense", schema);

export function publicExpense(value: IExpense & { _id: Types.ObjectId }) {
  return {
    id: value._id.toString(), category: value.category, description: value.description,
    amountLkr: value.amountLkr, currency: "LKR" as const, method: value.method,
    expenseDate: value.expenseDate, reference: value.reference,
    responsibleStaffId: value.responsibleStaff.toString(), responsibleStaffName: value.responsibleStaffName,
    createdAt: value.createdAt.toISOString(),
  };
}
