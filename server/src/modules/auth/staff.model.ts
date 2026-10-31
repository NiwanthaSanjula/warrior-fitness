
import mongoose, {
  Schema,
  type HydratedDocument,
} from "mongoose";

import { STAFF_ROLES, PERMISSIONS, effectivePermissions, type Permission, type StaffRole } from "./permissions.js";

export { STAFF_ROLES, type StaffRole };

export interface IStaff {
  fullName: string;
  email: string;
  passwordHash: string;
  role: StaffRole;
  isActive: boolean;
  permissions?: Permission[];
  sessionVersion?: number;
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
    permissions: {
      type: [{ type: String, enum: PERMISSIONS }],
      default: undefined,
    },
    sessionVersion: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isSafeInteger,
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
    permissions: effectivePermissions(staff),
  };
}
