
import mongoose, {
  Schema,
  type HydratedDocument,
  type Types,
} from "mongoose";

import type { DurationUnit } from
  "../membership-plans/plan.model.js";

import {
  addDays,
  getMembershipDateStatus,
  todayInColombo,
} from "./membership.dates.js";

export const ENROLLMENT_TYPES = [
  "INITIAL",
  "RENEWAL",
] as const;

export type EnrollmentType =
  (typeof ENROLLMENT_TYPES)[number];

export interface IPlanSnapshot {
  code: string;
  name: string;
  durationUnit: DurationUnit;
  durationCount: number;
  priceLkr: number;
}

export interface IMembership {
  member: Types.ObjectId;
  plan: Types.ObjectId;

  planSnapshot: IPlanSnapshot;

  enrollmentType: EnrollmentType;

  startDate: string;
  endDateExclusive: string;

  enrolledBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const planSnapshotSchema = new Schema<IPlanSnapshot>(
  {
    code: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    durationUnit: {
      type: String,
      enum: ["DAYS", "MONTHS"],
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
  },
  { _id: false }
);

const membershipSchema = new Schema<IMembership>(
  {
    member: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      immutable: true,
    },

    plan: {
      type: Schema.Types.ObjectId,
      ref: "MembershipPlan",
      required: true,
      immutable: true,
    },

    planSnapshot: {
      type: planSnapshotSchema,
      required: true,
      immutable: true,
    },

    enrollmentType: {
      type: String,
      enum: ENROLLMENT_TYPES,
      required: true,
      immutable: true,
    },

    startDate: {
      type: String,
      required: true,
      immutable: true,
    },

    endDateExclusive: {
      type: String,
      required: true,
      immutable: true,
    },

    enrolledBy: {
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

// Efficient member-history and expiry lookups.
membershipSchema.index({
  member: 1,
  startDate: -1,
});

membershipSchema.index({
  endDateExclusive: 1,
});

// Allow only one INITIAL enrollment per member.
// Future RENEWAL records are not subject
// to this particular unique constraint.
membershipSchema.index(
  { member: 1, enrollmentType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      enrollmentType: "INITIAL",
    },
  }
);

export const Membership = mongoose.model<IMembership>(
  "Membership",
  membershipSchema
);

export function toPublicMembership(
  membership: HydratedDocument<IMembership>,
  today: string = todayInColombo()
) {
  return {
    id: membership.id,
    memberId: membership.member.toString(),
    planId: membership.plan.toString(),

    planSnapshot: membership.planSnapshot,

    enrollmentType: membership.enrollmentType,

    startDate: membership.startDate,

    lastValidDate: addDays(
      membership.endDateExclusive,
      -1
    ),

    endDateExclusive: membership.endDateExclusive,

    status: getMembershipDateStatus(
      membership.startDate,
      membership.endDateExclusive,
      today
    ),

    enrolledBy: membership.enrolledBy.toString(),

    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}
