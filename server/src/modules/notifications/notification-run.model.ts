import mongoose, { Schema } from "mongoose";

export interface NotificationRunSummary { due: number; simulated: number; duplicates: number; skipped: number }
export interface INotificationRun {
  scheduledDate: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  startedAt: Date;
  completedAt?: Date | null;
  summary?: NotificationRunSummary | null;
  failureCode?: "SIMULATION_FAILED" | null;
}
const count = { type: Number, min: 0, validate: Number.isSafeInteger, required: true };
const summary = new Schema<NotificationRunSummary>({ due: count, simulated: count, duplicates: count, skipped: count }, { _id: false });
const schema = new Schema<INotificationRun>({
  scheduledDate: { type: String, required: true, unique: true, immutable: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, enum: ["RUNNING", "SUCCEEDED", "FAILED"], required: true },
  startedAt: { type: Date, required: true, immutable: true },
  completedAt: { type: Date, default: null }, summary: { type: summary, default: null },
  failureCode: { type: String, enum: ["SIMULATION_FAILED", null], default: null },
}, { strict: "throw", versionKey: false });
schema.index({ startedAt: -1, _id: -1 });
export const NotificationRun = mongoose.model<INotificationRun>("NotificationRun", schema);
