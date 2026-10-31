import mongoose, { Schema, type Types } from "mongoose";
import { NotificationRun } from "./notification-run.model.js";

export interface IConsent {
  member: Types.ObjectId;
  whatsappOptIn: boolean;
  updatedBy: Types.ObjectId;
  updatedAt: Date;
}
const consentSchema = new Schema<IConsent>({
  member: { type: Schema.Types.ObjectId, ref: "Member", unique: true, required: true },
  whatsappOptIn: { type: Boolean, required: true, default: false },
  updatedBy: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
}, { timestamps: true, strict: "throw" });
export const NotificationConsent = mongoose.model<IConsent>("NotificationConsent", consentSchema);

export interface IReminder {
  member: Types.ObjectId;
  membership: Types.ObjectId;
  memberReference: string;
  memberName: string;
  recipient: string;
  planName: string;
  lastValidDate: string;
  reminderType: "SEVEN_DAYS" | "THREE_DAYS" | "LAST_VALID_DAY";
  scheduledDate: string;
  message: string;
  channel: "WHATSAPP_SIMULATED";
  status: "SIMULATED";
  createdBy?: Types.ObjectId | null;
  trigger?: "MANUAL" | "SCHEDULED";
  createdAt: Date;
}
const reminderSchema = new Schema<IReminder>({
  member: { type: Schema.Types.ObjectId, ref: "Member", required: true },
  membership: { type: Schema.Types.ObjectId, ref: "Membership", required: true },
  memberReference: { type: String, required: true },
  memberName: { type: String, required: true },
  recipient: { type: String, required: true },
  planName: { type: String, required: true },
  lastValidDate: { type: String, required: true },
  reminderType: { type: String, enum: ["SEVEN_DAYS", "THREE_DAYS", "LAST_VALID_DAY"], required: true },
  scheduledDate: { type: String, required: true },
  message: { type: String, required: true },
  channel: { type: String, enum: ["WHATSAPP_SIMULATED"], required: true },
  status: { type: String, enum: ["SIMULATED"], required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "Staff", required: function (this: IReminder | mongoose.Query<unknown, IReminder>) {
    // Update validators run with a Query, and Query.get() ignores $setOnInsert.
    if (this instanceof mongoose.Query) {
      const update = this.getUpdate();
      return !update || Array.isArray(update) || update.$setOnInsert?.trigger !== "SCHEDULED";
    }
    return this?.trigger !== "SCHEDULED";
  }, default: null },
  trigger: { type: String, enum: ["MANUAL", "SCHEDULED"], default: "MANUAL" },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" });
reminderSchema.index({ membership: 1, reminderType: 1, scheduledDate: 1 }, { unique: true });
reminderSchema.index({ createdAt: -1 });
reminderSchema.index({ scheduledDate: 1 });
export const ReminderLog = mongoose.model<IReminder>("ReminderLog", reminderSchema);

export async function initializeNotificationModels(): Promise<void> {
  await Promise.all([NotificationConsent.init(), ReminderLog.init(), NotificationRun.init()]);
}
