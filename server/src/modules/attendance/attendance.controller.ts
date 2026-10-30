
import type { RequestHandler } from "express";

import { Member } from "../members/member.model.js";

import {
  Membership,
} from "../memberships/membership.model.js";

import {
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  Attendance,
  toPublicAttendance,
} from "./attendance.model.js";

import {
  checkInSchema,
} from "./attendance.validation.js";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

// POST /api/attendance/check-in
export const checkInMember: RequestHandler =
  async (req, res) => {
    // 1. Validate request body.
    const parsed = checkInSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid check-in request",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          message: issue.message,
        })),
      });
      return;
    }

    // 2. Verify authenticated staff.
    if (!req.staff) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const { memberId } = parsed.data;
    const today = todayInColombo();

    // 3. Find the member.
    const member = await Member.findById(memberId);

    if (!member) {
      res.status(404).json({
        success: false,
        message: "Member not found",
      });
      return;
    }

    // 4. Check member profile status.
    if (!member.isActive) {
      res.status(409).json({
        success: false,
        code: "MEMBER_INACTIVE",
        message:
          "This member profile is inactive. Check-in is not allowed.",
      });
      return;
    }

    // 5. Find a membership valid TODAY.
    //
    // startDate is inclusive.
    // endDateExclusive is the first invalid day.
    const activeMembership =
      await Membership.findOne({
        member: member._id,

        startDate: {
          $lte: today,
        },

        endDateExclusive: {
          $gt: today,
        },
      }).sort({
        endDateExclusive: -1,
      });

    if (!activeMembership) {
      // Check whether the member has purchased
      // a membership that starts in the future.
      const upcoming = await Membership.exists({
        member: member._id,
        startDate: {
          $gt: today,
        },
      });

      res.status(409).json({
        success: false,

        code: upcoming
          ? "MEMBERSHIP_NOT_STARTED"
          : "NO_ACTIVE_MEMBERSHIP",

        message: upcoming
          ? "The member's next membership has not started yet."
          : "The member does not have a membership valid today.",
      });
      return;
    }

    // 6. Prevent duplicate check-ins.
    const existingAttendance =
      await Attendance.findOne({
        member: member._id,
        attendanceDate: today,
      });

    if (existingAttendance) {
      res.status(200).json({
        success: true,
        message:
          "Member has already checked in today",
        alreadyCheckedIn: true,

        data: toPublicAttendance(
          existingAttendance
        ),
      });
      return;
    }

    // 7. Record new attendance.
    try {
      const attendance = await Attendance.create({
        member: member._id,
        membership: activeMembership._id,

        attendanceDate: today,

        // Server-generated timestamp.
        checkedInAt: new Date(),

        checkedInBy: req.staff.id,
      });

      res.status(201).json({
        success: true,
        message: "Member checked in successfully",
        alreadyCheckedIn: false,

        data: toPublicAttendance(attendance),
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      // Another staff request may have inserted
      // today's check-in at the same time.
      const completed = await Attendance.findOne({
        member: member._id,
        attendanceDate: today,
      });

      if (completed) {
        res.status(200).json({
          success: true,
          message:
            "Member has already checked in today",
          alreadyCheckedIn: true,

          data: toPublicAttendance(completed),
        });
        return;
      }

      throw error;
    }
  };
