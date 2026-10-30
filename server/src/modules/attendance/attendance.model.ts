
import mongoose, {
  Schema,
  type HydratedDocument,
  type Types,
} from "mongoose";

export interface IAttendance {
  member: Types.ObjectId;
  membership: Types.ObjectId;

  // Sri Lankan calendar date: YYYY-MM-DD
  attendanceDate: string;

  // Actual moment of check-in, stored in UTC
  checkedInAt: Date;

  checkedInBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    member: {
      type: Schema.Types.ObjectId,
      ref: "Member",
      required: true,
      immutable: true,
    },

    membership: {
      type: Schema.Types.ObjectId,
      ref: "Membership",
      required: true,
      immutable: true,
    },

    attendanceDate: {
      type: String,
      required: true,
      immutable: true,
    },

    checkedInAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },

    checkedInBy: {
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

// Only one recorded check-in per member
// per Sri Lankan calendar day.
attendanceSchema.index(
  {
    member: 1,
    attendanceDate: 1,
  },
  {
    unique: true,
    name: "unique_member_daily_checkin",
  }
);

// Efficient daily attendance retrieval.
attendanceSchema.index({
  attendanceDate: 1,
  checkedInAt: -1,
});

// Efficient member attendance history.
attendanceSchema.index({
  member: 1,
  checkedInAt: -1,
});

export const Attendance = mongoose.model<IAttendance>(
  "Attendance",
  attendanceSchema
);

export function toPublicAttendance(
  attendance: HydratedDocument<IAttendance>
) {
  return {
    id: attendance.id,

    memberId: attendance.member.toString(),
    membershipId: attendance.membership.toString(),

    attendanceDate: attendance.attendanceDate,
    checkedInAt: attendance.checkedInAt.toISOString(),

    checkedInBy: attendance.checkedInBy.toString(),

    createdAt: attendance.createdAt.toISOString(),
  };
}
