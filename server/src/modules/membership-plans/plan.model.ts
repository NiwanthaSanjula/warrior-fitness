
import mongoose, {
  Schema,
  type HydratedDocument,
  type Types,
} from "mongoose";

export const DURATION_UNITS = [
  "DAYS",
  "MONTHS",
] as const;

export type DurationUnit =
  (typeof DURATION_UNITS)[number];

export interface IMembershipPlan {
  code: string;
  name: string;
  description: string;

  durationUnit: DurationUnit;
  durationCount: number;

  priceLkr: number;
  isActive: boolean;

  createdBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const planSchema = new Schema<IMembershipPlan>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      uppercase: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    durationUnit: {
      type: String,
      enum: DURATION_UNITS,
      required: true,
    },

    durationCount: {
      type: Number,
      required: true,
      min: 1,
    },

    priceLkr: {
      type: Number,
      required: true,
      min: 1,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      immutable: true,
    },
  },
  {
    timestamps: true,
  }
);

export const MembershipPlan =
  mongoose.model<IMembershipPlan>(
    "MembershipPlan",
    planSchema
  );

// Consistent public API response.
export function toPublicPlan(
  plan: HydratedDocument<IMembershipPlan>
) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,

    durationUnit: plan.durationUnit,
    durationCount: plan.durationCount,

    priceLkr: plan.priceLkr,
    currency: "LKR",

    isActive: plan.isActive,
    createdBy: plan.createdBy.toString(),

    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
