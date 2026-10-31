import mongoose, { Schema } from "mongoose";

// Every money writer and closing transaction updates this same per-day row.
// The string _id gives each Colombo date a built-in unique key.
export interface IFinancialDay { _id: string; closed: boolean; revision: number }
const schema = new Schema<IFinancialDay>({
  _id: { type: String, required: true },
  closed: { type: Boolean, required: true, default: false },
  revision: { type: Number, required: true, default: 0, min: 0 },
}, { versionKey: false });
export const FinancialDay = mongoose.model<IFinancialDay>("FinancialDay", schema);
