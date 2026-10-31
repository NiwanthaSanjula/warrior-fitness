import mongoose, { Schema, type Types } from "mongoose";
import { AppError } from "../../utils/AppError.js";

export const STAFF_AUDIT_ACTIONS = [
  "STAFF_CREATED", "PROFILE_UPDATED", "PERMISSIONS_CHANGED", "PERMISSIONS_DEFAULTS_RESTORED",
  "STAFF_ACTIVATED", "STAFF_DEACTIVATED", "PASSWORD_RESET",
] as const;
export interface IStaffAudit {
  actor: Types.ObjectId; actorName: string;
  target: Types.ObjectId; targetName: string;
  action: (typeof STAFF_AUDIT_ACTIONS)[number]; createdAt: Date;
}
// Explicit allowlist: no password, hash, token, request body or email snapshots.
const schema = new Schema<IStaffAudit>({
  actor: { type: Schema.Types.ObjectId, ref: "Staff", required: true, immutable: true },
  actorName: { type: String, required: true, immutable: true },
  target: { type: Schema.Types.ObjectId, ref: "Staff", required: true, immutable: true },
  targetName: { type: String, required: true, immutable: true },
  action: { type: String, enum: STAFF_AUDIT_ACTIONS, required: true, immutable: true },
}, { strict: "throw", timestamps: { createdAt: true, updatedAt: false } });
schema.index({ target: 1, createdAt: -1, _id: -1 });
schema.index({ createdAt: -1, _id: -1 });
function immutableAudit(): never { throw new AppError(409, "Staff audit history cannot be edited or deleted"); }
schema.pre("save", function () { if (!this.isNew) immutableAudit(); });
schema.pre(["updateOne", "updateMany", "replaceOne", "findOneAndUpdate", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"], immutableAudit);
schema.pre("deleteOne", { document: true, query: false }, immutableAudit);
schema.pre("bulkWrite", immutableAudit);
export const StaffAudit = mongoose.model<IStaffAudit>("StaffAudit", schema);
