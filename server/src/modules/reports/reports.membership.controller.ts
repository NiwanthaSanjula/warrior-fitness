
import type { RequestHandler } from "express";

import { Member } from "../members/member.model.js";

import {
  Membership,
} from "../memberships/membership.model.js";

import {
  addDays,
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  resolveReportPeriod,
} from "./reports.period.js";

interface MembershipActivityResult {
  overall: Array<{
    totalPurchases: number;
    uniquePurchasingMembers: number;
  }>;

  byType: Array<{
    _id: string;
    count: number;
  }>;

  byPlan: Array<{
    _id: string;
    count: number;
  }>;

  byDay: Array<{
    _id: string;
    count: number;
  }>;
}

interface ActiveMembersResult {
  totalActiveMembers: number;
}

/**
 * GET /api/reports/memberships/activity
 *
 * Counts membership records CREATED
 * inside the selected reporting period.
 */
export const getMembershipActivity: RequestHandler =
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

    const {
      from,
      to,
      days,
      startUtc,
      endUtcExclusive,
    } = resolved.period;

    const [result] =
      await Membership.aggregate<MembershipActivityResult>([
        {
          $match: {
            createdAt: {
              $gte: startUtc,
              $lt: endUtcExclusive,
            },
          },
        },

        {
          $facet: {
            // Membership purchases and the number
            // of distinct members who purchased.
            overall: [
              {
                $group: {
                  _id: null,

                  totalPurchases: {
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

                  totalPurchases: 1,

                  uniquePurchasingMembers: {
                    $size: "$members",
                  },
                },
              },
            ],

            // Preserve the enum values that your
            // existing membership schema stores.
            byType: [
              {
                $group: {
                  _id: {
                    $ifNull: [
                      "$enrollmentType",
                      "UNSPECIFIED",
                    ],
                  },

                  count: {
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

            // Group purchases using immutable
            // plan snapshots, not current plan names.
            byPlan: [
              {
                $group: {
                  _id: {
                    $ifNull: [
                      "$planSnapshot.name",
                      "Unnamed Plan",
                    ],
                  },

                  count: {
                    $sum: 1,
                  },
                },
              },

              {
                $sort: {
                  count: -1,
                  _id: 1,
                },
              },
            ],

            // Group by Sri Lankan purchase date.
            byDay: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      date: "$createdAt",
                      format: "%Y-%m-%d",
                      timezone: "Asia/Colombo",
                    },
                  },

                  count: {
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

    const dayMap = new Map(
      (result?.byDay ?? []).map((row) => [
        row._id,
        row.count,
      ])
    );

    const byDay = Array.from(
      { length: days },
      (_, index) => {
        const date = addDays(from, index);

        return {
          date,
          purchases: dayMap.get(date) ?? 0,
        };
      }
    );

    res.status(200).json({
      success: true,

      reportType: "MEMBERSHIP_ACTIVITY",
      timezone: "Asia/Colombo",

      period: {
        from,
        to,
        days,
      },

      summary: {
        totalPurchases:
          overall?.totalPurchases ?? 0,

        uniquePurchasingMembers:
          overall?.uniquePurchasingMembers ?? 0,
      },

      byType: (result?.byType ?? []).map(
        (row) => ({
          enrollmentType: row._id,
          purchases: row.count,
        })
      ),

      byPlan: (result?.byPlan ?? []).map(
        (row) => ({
          planName: row._id,
          purchases: row.count,
        })
      ),

      byDay,
    });
  };

/**
 * GET /api/reports/memberships/active
 *
 * Current active profile count with
 * valid membership coverage today.
 *
 * Does NOT accept a historical date.
 */
export const getActiveMembershipSnapshot: RequestHandler =
  async (req, res) => {
    if (Object.keys(req.query).length > 0) {
      res.status(400).json({
        success: false,
        message:
          "Active membership snapshot does not accept date filters",
      });
      return;
    }

    const today = todayInColombo();

    const [result] =
      await Membership.aggregate<ActiveMembersResult>([
        // Purchased period covering today.
        {
          $match: {
            startDate: {
              $lte: today,
            },

            endDateExclusive: {
              $gt: today,
            },
          },
        },

        // Count each member once, even if
        // duplicate/overlapping coverage exists.
        {
          $group: {
            _id: "$member",
          },
        },

        // Attach the member's CURRENT profile.
        {
          $lookup: {
            from: Member.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "profile",
          },
        },

        {
          $unwind: "$profile",
        },

        {
          $match: {
            "profile.isActive": true,
          },
        },

        {
          $count: "totalActiveMembers",
        },
      ]);

    res.status(200).json({
      success: true,

      reportType: "ACTIVE_MEMBERS_SNAPSHOT",
      timezone: "Asia/Colombo",

      asOfDate: today,
      generatedAt: new Date().toISOString(),

      summary: {
        totalActiveMembers:
          result?.totalActiveMembers ?? 0,
      },
    });
  };
