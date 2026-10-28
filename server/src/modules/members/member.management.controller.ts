
import type { RequestHandler } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import {
  Member,
  toPublicMember,
  type IMember,
} from "./member.model.js";

import {
  memberListQuerySchema,
  updateMemberSchema,
} from "./member.management.validation.js";

// Prevent special regex characters from
// changing the meaning of a search.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isValidMemberObjectId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id);
}

function validationErrors(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));
}

// GET /api/members
export const getMembers: RequestHandler = async (
  req,
  res
) => {
  const parsed = memberListQuerySchema.safeParse(
    req.query
  );

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid query parameters",
      errors: validationErrors(parsed.error),
    });
    return;
  }

  const { q, page, limit, status } = parsed.data;

  const filter: Record<string, any> = {};

  // Filter by member profile status.
  if (status === "active") {
    filter.isActive = true;
  } else if (status === "inactive") {
    filter.isActive = false;
  }

  // Search by name, phone, or member ID.
  if (q) {
    const safeSearch = escapeRegex(q);

    const phoneTerm = q.replace(/[\s()-]/g, "");

    const normalizedPhoneTerm =
      /^0\d+$/.test(phoneTerm)
        ? `+94${phoneTerm.slice(1)}`
        : phoneTerm;

    filter.$or = [
      {
        fullName: {
          $regex: safeSearch,
          $options: "i",
        },
      },
      {
        memberId: {
          $regex: safeSearch,
          $options: "i",
        },
      },
      {
        phone: {
          $regex: escapeRegex(normalizedPhoneTerm),
          $options: "i",
        },
      },
    ];
  }

  const skip = (page - 1) * limit;

  const [members, total] = await Promise.all([
    Member.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit),

    Member.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: members.map(toPublicMember),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

// GET /api/members/:id
export const getMemberById: RequestHandler = async (
  req,
  res
) => {
  const id = req.params.id as string;

  if (!isValidMemberObjectId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid member ID",
    });
    return;
  }

  const member = await Member.findById(id);

  if (!member) {
    res.status(404).json({
      success: false,
      message: "Member not found",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: toPublicMember(member),
  });
};

// PATCH /api/members/:id
export const updateMember: RequestHandler = async (
  req,
  res
) => {
  const id = req.params.id as string;

  if (!isValidMemberObjectId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid member ID",
    });
    return;
  }

  const parsed = updateMemberSchema.safeParse(
    req.body
  );

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Member update validation failed",
      errors: validationErrors(parsed.error),
    });
    return;
  }

  const member = await Member.findById(id);

  if (!member) {
    res.status(404).json({
      success: false,
      message: "Member not found",
    });
    return;
  }

  const data = parsed.data;

  // Calculate the new identity values.
  const nextFullName =
    data.fullName !== undefined
      ? data.fullName.replace(/\s+/g, " ")
      : member.fullName;

  const nextPhone = data.phone ?? member.phone;

  const nextNormalizedFullName = nextFullName
    .normalize("NFKC")
    .toLowerCase();

  // Check whether the edited details
  // would duplicate another member.
  const duplicate = await Member.exists({
    _id: { $ne: member._id },
    phone: nextPhone,
    normalizedFullName: nextNormalizedFullName,
  });

  if (duplicate) {
    res.status(409).json({
      success: false,
      message:
        "Another member with this name and phone number already exists",
    });
    return;
  }

  // Update member identity.
  member.fullName = nextFullName;
  member.normalizedFullName = nextNormalizedFullName;
  member.phone = nextPhone;

  // Update optional profile fields.
  if (data.gender !== undefined) {
    member.gender = data.gender ?? undefined;
  }

  if (data.dateOfBirth !== undefined) {
    member.dateOfBirth = data.dateOfBirth
      ? new Date(`${data.dateOfBirth}T00:00:00.000Z`)
      : undefined;
  }

  if (data.address !== undefined) {
    member.address = data.address ?? undefined;
  }

  if (data.emergencyContact !== undefined) {
    member.emergencyContact =
      data.emergencyContact ?? undefined;
  }

  await member.save();

  res.status(200).json({
    success: true,
    message: "Member updated successfully",
    data: toPublicMember(member),
  });
};

// PATCH /api/members/:id/status
export const updateMemberStatus: RequestHandler = async (
  req,
  res
) => {
  const id = req.params.id as string;

  if (!isValidMemberObjectId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid member ID",
    });
    return;
  }

  const statusSchema = z.strictObject({
    isActive: z.boolean(),
  });

  const parsed = statusSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid member status",
      errors: validationErrors(parsed.error),
    });
    return;
  }

  const member = await Member.findById(id);

  if (!member) {
    res.status(404).json({
      success: false,
      message: "Member not found",
    });
    return;
  }

  member.isActive = parsed.data.isActive;

  await member.save();

  res.status(200).json({
    success: true,
    message: member.isActive
      ? "Member reactivated successfully"
      : "Member deactivated successfully",
    data: toPublicMember(member),
  });
};
