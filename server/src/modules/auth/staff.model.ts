
import mongoose, {
  Schema,
  type HydratedDocument,
} from "mongoose";

export const STAFF_ROLES = [
  "ADMIN",
  "RECEPTIONIST",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export interface IStaff {
  fullName: string;
  email: string;
  passwordHash: string;
  role: StaffRole;
  isActive: boolean;
}

const staffSchema = new Schema<IStaff>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: STAFF_ROLES,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Staff = mongoose.model<IStaff>(
  "Staff",
  staffSchema
);

export function toPublicStaff(
  staff: HydratedDocument<IStaff>
) {
  return {
    id: staff.id,
    fullName: staff.fullName,
    email: staff.email,
    role: staff.role,
    isActive: staff.isActive,
  };
}
