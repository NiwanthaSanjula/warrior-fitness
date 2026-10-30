import type { RequestHandler } from "express";

import { Member } from "../members/member.model.js";

import {
  addDays,
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  Attendance,
  toPublicAttendance,
  type IAttendance,
} from "./attendance.model.js";

import {
  dailyAttendanceQuerySchema,
  attendanceSummaryQuerySchema,
  memberAttendanceQuerySchema,
} from "./attendance.reporting.validation.js";

const objectIdPattern = /^[a-fA-F0-9]{24}$/;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validationError(
  res: Parameters<RequestHandler>[1]
) {
  res.status(400).json({
    success: false,
    message: "Invalid attendance query parameters",
  });
}

// GET /api/attendance
export const getDailyAttendance: RequestHandler =
  async (req, res) => {
    const parsed = dailyAttendanceQuerySchema.safeParse(
      req.query
    );

    if (!parsed.success) {
      validationError(res);
      return;
    }

    const {
      search,
      page,
      limit,
    } = parsed.data;

    const date =
      parsed.data.date ?? todayInColombo();

    const filter: Record<string, any> = {
      attendanceDate: date,
    };

    // Find members matching the search text.
    if (search) {
      const regex = new RegExp(
        escapeRegex(search),
        "i"
      );

      const matchingMembers = await Member.find({
        $or: [
          { fullName: regex },
          { memberId: regex },
          { phone: regex },
        ],
      })
        .select("_id")
        .lean();

      filter.member = {
        $in: matchingMembers.map(
          (member) => member._id
        ),
      };
    }

    // Retrieve one page and its total count.
    const [records, total] = await Promise.all([
      Attendance.find(filter)
        .sort({
          checkedInAt: -1,
          _id: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit),

      Attendance.countDocuments(filter),
    ]);

    // Load member details with one additional
    // query rather than one query per check-in.
    const members = await Member.find({
      _id: {
        $in: records.map(
          (record) => record.member
        ),
      },
    })
      .select(
        "fullName memberId phone isActive"
      )
      .lean();

    const memberMap = new Map(
      members.map((member) => [
        member._id.toString(),
        {
          fullName: member.fullName,
          memberReference: member.memberId,
          phone: member.phone,
          isActive: member.isActive,
        },
      ])
    );

    res.status(200).json({
      success: true,
      date,

      data: records.map((record) => {
        const member = memberMap.get(
          record.member.toString()
        );

        return {
          ...toPublicAttendance(record),

          memberName:
            member?.fullName ?? null,

          memberReference:
            member?.memberReference ?? null,

          memberPhone:
            member?.phone ?? null,

          memberProfileActive:
            member?.isActive ?? null,
        };
      }),

      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  };

// GET /api/attendance/summary
export const getAttendanceSummary: RequestHandler =
  async (req, res) => {
    const parsed =
      attendanceSummaryQuerySchema.safeParse(
        req.query
      );

    if (!parsed.success) {
      validationError(res);
      return;
    }

    const date =
      parsed.data.date ?? todayInColombo();

    // Include selected date and six previous days.
    const firstDate = addDays(date, -6);

    const counts = await Attendance.aggregate<{
      _id: string;
      count: number;
    }>([
      {
        $match: {
          attendanceDate: {
            $gte: firstDate,
            $lte: date,
          },
        },
      },
      {
        $group: {
          _id: "$attendanceDate",
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map(
      counts.map((item) => [
        item._id,
        item.count,
      ])
    );

    // Include zero-visit days in the chart data.
    const last7Days = Array.from(
      { length: 7 },
      (_, index) => {
        const day = addDays(firstDate, index);

        return {
          date: day,
          checkIns: countMap.get(day) ?? 0,
        };
      }
    );

    const totalCheckIns =
      countMap.get(date) ?? 0;

    const previousDayCheckIns =
      countMap.get(addDays(date, -1)) ?? 0;

    res.status(200).json({
      success: true,

      data: {
        date,
        totalCheckIns,
        previousDayCheckIns,

        changeFromPreviousDay:
          totalCheckIns - previousDayCheckIns,

        last7Days,
      },
    });
  };

// GET /api/attendance/member/:memberId
export const getMemberAttendance: RequestHandler =
  async (req, res) => {
    const memberId = req.params.memberId as string;

    if (
      !memberId ||
      !objectIdPattern.test(memberId)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid member ID",
      });
      return;
    }

    const parsed =
      memberAttendanceQuerySchema.safeParse(
        req.query
      );

    if (!parsed.success) {
      validationError(res);
      return;
    }

    const member = await Member.findById(
      memberId
    );

    if (!member) {
      res.status(404).json({
        success: false,
        message: "Member not found",
      });
      return;
    }

    const {
      from,
      to,
      page,
      limit,
    } = parsed.data;

    const filter: Record<string, any> = {
      member: member._id,
    };

    // Apply an optional date range.
    if (from || to) {
      filter.attendanceDate = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const [records, total] = await Promise.all([
      Attendance.find(filter)
        .sort({
          checkedInAt: -1,
          _id: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit),

      Attendance.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,

      member: {
        id: member.id,
        memberReference: member.memberId,
        fullName: member.fullName,
      },

      data: records.map(toPublicAttendance),

      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  };