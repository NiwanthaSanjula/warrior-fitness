
import mongoose, {
  Schema,
  type HydratedDocument,
  type Types,
} from "mongoose";

export const FOLLOW_UP_TYPES = [
  "MEMBERSHIP_EXPIRING",
  "PAYMENT_OUTSTANDING",
  "ATTENDANCE_INACTIVE",
] as const;

export const FOLLOW_UP_METHODS = [
  "PHONE_CALL",
  "WHATSAPP",
  "SMS",
  "EMAIL",
  "IN_PERSON",
  "INTERNAL_REVIEW",
] as const;

export const FOLLOW_UP_OUTCOMES = [
  "CONTACTED",
  "NO_ANSWER",
  "PROMISED_ACTION",
  "FOLLOW_UP_REQUIRED",
  "DECLINED",
  "RESOLVED",
] as const;

export type FollowUpType =
  (typeof FOLLOW_UP_TYPES)[number];

export type FollowUpMethod =
  (typeof FOLLOW_UP_METHODS)[number];

export type FollowUpOutcome =
  (typeof FOLLOW_UP_OUTCOMES)[number];

export interface IFollowUp {
  requestId: string;

  member: Types.ObjectId;
  alertType: FollowUpType;

  method: FollowUpMethod;
  outcome: FollowUpOutcome;
  notes: string;

  nextFollowUpDate: string | null;

  handledBy: Types.ObjectId;
  recordedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const followUpSchema = new Schema<IFollowUp>(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },

    member: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      immutable: true,
    },

    alertType: {
      type: String,
      enum: FOLLOW_UP_TYPES,
      required: true,
      immutable: true,
    },

    method: {
      type: String,
      enum: FOLLOW_UP_METHODS,
      required: true,
      immutable: true,
    },

    outcome: {
      type: String,
      enum: FOLLOW_UP_OUTCOMES,
      required: true,
      immutable: true,
    },

    notes: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 500,
      immutable: true,
    },

    nextFollowUpDate: {
      type: String,
      default: null,
      immutable: true,
    },

    handledBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      immutable: true,
    },

    recordedAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: true,
  }
);

followUpSchema.index(
  {
    member: 1,
    alertType: 1,
    recordedAt: -1,
  },
  {
    name: "member_followup_history",
  }
);

followUpSchema.index({
  nextFollowUpDate: 1,
});

export const FollowUp = mongoose.model<IFollowUp>(
  "AttentionFollowUp",
  followUpSchema
);

export function toPublicFollowUp(
  followUp: HydratedDocument<IFollowUp>
) {
  return {
    id: followUp.id,
    requestId: followUp.requestId,

    memberId: followUp.member.toString(),
    alertType: followUp.alertType,

    method: followUp.method,
    outcome: followUp.outcome,
    notes: followUp.notes,

    nextFollowUpDate: followUp.nextFollowUpDate,

    handledBy: followUp.handledBy.toString(),
    recordedAt: followUp.recordedAt.toISOString(),
    createdAt: followUp.createdAt.toISOString(),
  };
}
