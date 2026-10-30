
import type { RequestHandler } from "express";

import { Member } from "../members/member.model.js";

import {
  Membership,
} from "../memberships/membership.model.js";

import {
  Attendance,
} from "../attendance/attendance.model.js";

import {
  addDays,
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  attendanceInactivityQuerySchema,
} from "./attention.inactivity.validation.js";

interface CoveragePeriod {
  startDate: string;
  endDateExclusive: string;
}

interface LastVisitRow {
  _id: string;
  lastVisitDate: string;
  lastCheckedInAt: Date;
}

function escapeRegex(value: string): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function daysBetween(
  fromDate: string,
  toDate: string
): number {
  const from = Date.parse(
    `${fromDate}T00:00:00.000Z`
  );

  const to = Date.parse(
    `${toDate}T00:00:00.000Z`
  );

  return Math.round(
    (to - from) / 86400000
  );
}

/**
 * Returns true only when purchased membership
 * periods cover every calendar day from
 * cutoff through today, with no gaps.
 *
 * Membership startDate is inclusive.
 * endDateExclusive is exclusive.
 */
function hasContinuousCoverage(
  periods: CoveragePeriod[],
  cutoff: string,
  today: string
): boolean {
  const sorted = [...periods].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.endDateExclusive.localeCompare(
        b.endDateExclusive
      )
  );

  let coveredThrough: string | null = null;

  for (const period of sorted) {
    if (coveredThrough === null) {
      // Find a purchased period that covers
      // the beginning of our inactivity window.
      if (
        period.startDate <= cutoff &&
        period.endDateExclusive > cutoff
      ) {
        coveredThrough = period.endDateExclusive;
      }
    } else {
      // A gap exists between purchased periods.
      if (period.startDate > coveredThrough) {
        break;
      }

      // Extend coverage through a contiguous
      // renewal or overlapping period.
      if (period.endDateExclusive > coveredThrough) {
        coveredThrough = period.endDateExclusive;
      }
    }

    if (
      coveredThrough !== null &&
      coveredThrough > today
    ) {
      return true;
    }
  }

  return false;
}

// GET /api/attention/inactive-attendance
export const getAttendanceInactivityAlerts: RequestHandler =
  async (req, res) => {
    const parsed =
      attendanceInactivityQuerySchema.safeParse(
        req.query
      );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message:
          "Invalid attendance inactivity query",
        errors: parsed.error.issues.map(
          (issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })
        ),
      });
      return;
    }

    const {
      days,
      search,
      page,
      limit,
    } = parsed.data;

    const today = todayInColombo();

    // A visit on or before this date means
    // at least 'days' calendar days have elapsed.
    const cutoff = addDays(today, -days);

    const regex = search
      ? new RegExp(escapeRegex(search), "i")
      : null;

    // 1. Find active member profiles.
    const members = await Member.find({
      isActive: true,

      ...(regex
        ? {
            $or: [
              { fullName: regex },
              { memberId: regex },
              { phone: regex },
            ],
          }
        : {}),
    })
      .select("_id fullName memberId phone")
      .lean();

    if (members.length === 0) {
      res.status(200).json({
        success: true,
        asOfDate: today,
        inactivityDays: days,
        search,

        summary: {
          membersNeedingFollowUp: 0,
          neverAttendedCount: 0,
        },

        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
      return;
    }

    const memberIds = members.map(
      (member) => member._id
    );

    // 2. Load purchased periods that could
    // contribute to uninterrupted coverage
    // between cutoff and today.
    const purchasedPeriods = await Membership.find({
      member: {
        $in: memberIds,
      },

      startDate: {
        $lte: today,
      },

      endDateExclusive: {
        $gt: cutoff,
      },
    })
      .select("member startDate endDateExclusive")
      .lean();

    const periodsByMember =
      new Map<string, CoveragePeriod[]>();

    for (const period of purchasedPeriods) {
      const key = period.member.toString();

      const existing =
        periodsByMember.get(key) ?? [];

      existing.push({
        startDate: period.startDate,
        endDateExclusive: period.endDateExclusive,
      });

      periodsByMember.set(key, existing);
    }

    // 3. Exclude newly enrolled members,
    // expired memberships and coverage gaps.
    const eligibleMembers = members.filter(
      (member) => {
        const periods =
          periodsByMember.get(
            member._id.toString()
          ) ?? [];

        return hasContinuousCoverage(
          periods,
          cutoff,
          today
        );
      }
    );

    if (eligibleMembers.length === 0) {
      res.status(200).json({
        success: true,
        asOfDate: today,
        inactivityDays: days,
        search,

        summary: {
          membersNeedingFollowUp: 0,
          neverAttendedCount: 0,
        },

        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
      return;
    }

    // 4. Find each eligible member's
    // latest recorded attendance.
    const lastVisits = await Attendance.aggregate<{
      _id: import("mongoose").Types.ObjectId;
      lastVisitDate: string;
      lastCheckedInAt: Date;
    }>([
      {
        $match: {
          member: {
            $in: eligibleMembers.map(
              (member) => member._id
            ),
          },

          attendanceDate: {
            $lte: today,
          },
        },
      },

      {
        $sort: {
          attendanceDate: -1,
          checkedInAt: -1,
          _id: -1,
        },
      },

      {
        $group: {
          _id: "$member",

          lastVisitDate: {
            $first: "$attendanceDate",
          },

          lastCheckedInAt: {
            $first: "$checkedInAt",
          },
        },
      },
    ]);

    const lastVisitMap = new Map<
      string,
      Omit<LastVisitRow, "_id">
    >(
      lastVisits.map((visit) => [
        visit._id.toString(),
        {
          lastVisitDate: visit.lastVisitDate,
          lastCheckedInAt: visit.lastCheckedInAt,
        },
      ])
    );

    // 5. Include members with no recent visits.
    const alerts = eligibleMembers.flatMap(
      (member) => {
        const lastVisit = lastVisitMap.get(
          member._id.toString()
        );

        // A recent visit means no alert.
        if (
          lastVisit &&
          lastVisit.lastVisitDate > cutoff
        ) {
          return [];
        }

        const neverAttended = !lastVisit;

        return [{
          type: "ATTENDANCE_INACTIVE" as const,

          memberId:
            member._id.toString(),

          memberName: member.fullName,
          memberReference: member.memberId,
          memberPhone: member.phone ?? null,

          memberProfileActive: true,

          reason: neverAttended
            ? "NEVER_ATTENDED" as const
            : "NO_RECENT_VISIT" as const,

          lastVisitDate:
            lastVisit?.lastVisitDate ?? null,

          lastCheckedInAt:
            lastVisit?.lastCheckedInAt.toISOString()
              ?? null,

          daysSinceLastVisit: lastVisit
            ? daysBetween(
                lastVisit.lastVisitDate,
                today
              )
            : null,

          inactivityThresholdDays: days,
        }];
      }
    );

    // 6. Prioritize never-attended members,
    // followed by the oldest last visits.
    alerts.sort((a, b) => {
      const aDate = a.lastVisitDate ?? "";
      const bDate = b.lastVisitDate ?? "";

      return (
        aDate.localeCompare(bDate) ||
        a.memberName.localeCompare(b.memberName) ||
        a.memberId.localeCompare(b.memberId)
      );
    });

    const total = alerts.length;

    const startIndex = (page - 1) * limit;

    const paginatedAlerts = alerts.slice(
      startIndex,
      startIndex + limit
    );

    // 7. Return the current attention queue.
    res.status(200).json({
      success: true,

      asOfDate: today,
      inactivityDays: days,
      search,

      summary: {
        membersNeedingFollowUp: total,

        neverAttendedCount: alerts.filter(
          (alert) =>
            alert.reason === "NEVER_ATTENDED"
        ).length,
      },

      data: paginatedAlerts,

      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  };
