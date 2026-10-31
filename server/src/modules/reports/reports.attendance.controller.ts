
import type { RequestHandler } from "express";

import {
  Attendance,
} from "../attendance/attendance.model.js";

import {
  addDays,
} from "../memberships/membership.dates.js";

import {
  resolveReportPeriod,
} from "./reports.period.js";

interface AttendanceAggregationResult {
  overall: Array<{
    totalVisits: number;
    uniqueVisitors: number;
  }>;

  byDay: Array<{
    _id: string;
    visits: number;
  }>;
}

interface AttendanceDay {
  date: string;
  visits: number;
}

/**
 * GET /api/reports/attendance/trends
 *
 * Reports recorded check-ins over
 * a Sri Lankan calendar-date range.
 */
export const getAttendanceTrends: RequestHandler =
  async (req, res) => {
    const resolved = resolveReportPeriod(
      req.query
    );

    if (!resolved.success) {
      res.status(400).json({
        success: false,
        message: resolved.message,
      });
      return;
    }

    const { from, to, days } =
      resolved.period;

    // Attendance.attendanceDate already stores
    // the local YYYY-MM-DD date.
    const [result] =
      await Attendance.aggregate<AttendanceAggregationResult>([
        {
          $match: {
            attendanceDate: {
              $gte: from,
              $lte: to,
            },
          },
        },

        {
          $facet: {
            overall: [
              {
                $group: {
                  _id: null,

                  totalVisits: {
                    $sum: 1,
                  },

                  members: {
                    $addToSet: "$member",
                  },
                },
              },

              {
                $project: {
                  _id: 0,
                  totalVisits: 1,

                  uniqueVisitors: {
                    $size: "$members",
                  },
                },
              },
            ],

            byDay: [
              {
                $group: {
                  _id: "$attendanceDate",

                  visits: {
                    $sum: 1,
                  },
                },
              },

              {
                $sort: {
                  _id: 1,
                },
              },
            ],
          },
        },
      ]);

    const overall = result?.overall[0];

    const dailyMap = new Map(
      (result?.byDay ?? []).map((row) => [
        row._id,
        row.visits,
      ])
    );

    // Include days with no recorded visits.
    const byDay: AttendanceDay[] = Array.from(
      { length: days },
      (_, index) => {
        const date = addDays(from, index);

        return {
          date,
          visits: dailyMap.get(date) ?? 0,
        };
      }
    );

    // The first date wins if busiest-day
    // counts are tied.
    let busiestDay: AttendanceDay | null = null;

    for (const day of byDay) {
      if (
        day.visits > 0 &&
        (
          busiestDay === null ||
          day.visits > busiestDay.visits
        )
      ) {
        busiestDay = day;
      }
    }

    const totalVisits =
      overall?.totalVisits ?? 0;

    res.status(200).json({
      success: true,

      reportType: "ATTENDANCE_TRENDS",
      timezone: "Asia/Colombo",

      period: {
        from,
        to,
        days,
      },

      summary: {
        totalVisits,

        uniqueVisitors:
          overall?.uniqueVisitors ?? 0,

        averageVisitsPerDay:
          Number(
            (totalVisits / days).toFixed(2)
          ),

        busiestDay,
      },

      byDay,
    });
  };
