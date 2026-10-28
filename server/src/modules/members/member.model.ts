
import mongoose, {
  Schema,
  type HydratedDocument,
  type Types,
} from "mongoose";

export const MEMBER_GENDERS = [
  "MALE",
  "FEMALE",
  "OTHER",
  "PREFER_NOT_TO_SAY",
] as const;

export type MemberGender =
  (typeof MEMBER_GENDERS)[number];

interface EmergencyContact {
  name: string;
  phone: string;
}

export interface IMember {
  memberId: string;
  fullName: string;
  normalizedFullName: string;
  phone: string;
  gender?: MemberGender;
  dateOfBirth?: Date;
  address?: string;
  emergencyContact?: EmergencyContact;
  joinedAt: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
}

const emergencyContactSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const memberSchema = new Schema<IMember>(
  {
    memberId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    normalizedFullName: {
      type: String,
      required: true,
      select: false,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    gender: {
      type: String,
      enum: MEMBER_GENDERS,
    },

    dateOfBirth: {
      type: Date,
    },

    address: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    emergencyContact: {
      type: emergencyContactSchema,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
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

// Prevent duplicate full name + phone combinations.
memberSchema.index(
  { phone: 1, normalizedFullName: 1 },
  {
    unique: true,
    name: "unique_member_identity",
  }
);

export const Member = mongoose.model<IMember>(
  "Member",
  memberSchema
);

// Only expose intended fields to API consumers.
export function toPublicMember(
  member: HydratedDocument<IMember>
) {
  return {
    id: member.id,
    memberId: member.memberId,
    fullName: member.fullName,
    phone: member.phone,
    gender: member.gender ?? null,
    dateOfBirth: member.dateOfBirth
      ? member.dateOfBirth.toISOString().slice(0, 10)
      : null,
    address: member.address ?? null,
    emergencyContact: member.emergencyContact
      ? {
          name: member.emergencyContact.name,
          phone: member.emergencyContact.phone,
        }
      : null,
    joinedAt: member.joinedAt.toISOString(),
    isActive: member.isActive,
    createdBy: member.createdBy.toString(),
  };
}
