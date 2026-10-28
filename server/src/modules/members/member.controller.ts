
import { randomBytes } from "node:crypto";

import type { RequestHandler } from "express";
import { Types } from "mongoose";

import {
  Member,
  toPublicMember,
} from "./member.model.js";

import {
  createMemberSchema,
} from "./member.validation.js";

// Generate a public member reference.
function generateMemberId(): string {
  const randomPart = randomBytes(6)
    .toString("hex")
    .toUpperCase();

  return `WF-${randomPart}`;
}

// POST /api/members
export const createMember: RequestHandler = async (
  req,
  res
) => {
  // Validate incoming data.
  const parsed = createMemberSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Member validation failed",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    });
    return;
  }

  // This route must be protected by authentication.
  if (!req.staff) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const {
    phone,
    gender,
    dateOfBirth,
    address,
    emergencyContact,
  } = parsed.data;

  const fullName = parsed.data.fullName.replace(
    /\s+/g,
    " "
  );

  const normalizedFullName = fullName
    .normalize("NFKC")
    .toLowerCase();

  // Prevent accidental duplicate registration.
  const existingMember = await Member.exists({
    phone,
    normalizedFullName,
  });

  if (existingMember) {
    res.status(409).json({
      success: false,
      message:
        "A member with this name and phone number already exists",
    });
    return;
  }

  // Create the member record.
  const member = await Member.create({
    memberId: generateMemberId(),

    fullName,
    normalizedFullName,
    phone,
    gender,

    dateOfBirth: dateOfBirth
      ? new Date(`${dateOfBirth}T00:00:00.000Z`)
      : undefined,

    address,
    emergencyContact,

    createdBy: new Types.ObjectId(req.staff.id),
  });

  res.status(201).json({
    success: true,
    message: "Member registered successfully",
    data: toPublicMember(member),
  });
};
