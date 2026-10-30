
import type { RequestHandler } from "express";
import type { Types } from "mongoose";

import { Member } from "../members/member.model.js";

import {
  Membership,
} from "../memberships/membership.model.js";

import {
  addDays,
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  expiringMembershipQuerySchema,
} from "./attention.validation.js";

interface ExpiringMemberRow {
  memberId: Types.ObjectId;
  membershipId: Types.ObjectId;

  memberName: string;
  memberReference: string;
  memberPhone?: string;

  planName: string;
  endDateExclusive: string;
}

interface ExpiringAggregationResult {
  metadata: Array<{
    total: number;
  }>;

  records: ExpiringMemberRow[];
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

// GET /api/attention/expiring
export const getExpiringMemberships: RequestHandler =
  async (req, res) => {
    const parsed =
      expiringMembershipQuerySchema.safeParse(
        req.query
      );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message:
          "Invalid expiring membership query",
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
      page,
      limit,
    } = parsed.data;

    // Always use the gym's local calendar date.
    const today = todayInColombo();

    // Exclusive end of the alert window.
    const windowEndExclusive = addDays(
      today,
      days
    );

    const [result] =
      await Membership.aggregate<ExpiringAggregationResult>([
        // Sort purchased periods by latest ending date.
        {
          $sort: {
            endDateExclusive: -1,
            startDate: -1,
            _id: -1,
          },
        },

        // Produce one record per member.
        {
          $group: {
            _id: "$member",

            // Latest purchased period, including
            // any future contiguous renewal.
            latestPeriod: {
              $first: {
                _id: "$_id",
                startDate: "$startDate",
                endDateExclusive:
                  "$endDateExclusive",
                planName:
                  "$planSnapshot.name",
              },
            },

            // Confirm that at least one purchased
            // membership covers today's date.
            hasActiveCoverage: {
              $max: {
                $cond: [
                  {
                    $and: [
                      {
                        $lte: [
                          "$startDate",
                          today,
                        ],
                      },
                      {
                        $gt: [
                          "$endDateExclusive",
                          today,
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },

        // The member must have valid coverage today,
        // and their FINAL purchased coverage must
        // end inside the requested alert window.
        {
          $match: {
            hasActiveCoverage: 1,

            "latestPeriod.endDateExclusive": {
              $gt: today,
              $lte: windowEndExclusive,
            },
          },
        },

        // Attach the actual member profile.
        {
          $lookup: {
            from: Member.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "member",
          },
        },

        {
          $unwind: "$member",
        },

        // Inactive member profiles are excluded
        // from membership expiry follow-ups.
        {
          $match: {
            "member.isActive": true,
          },
        },

        // Return paginated results and the total
        // number of matching members together.
        {
          $facet: {
            metadata: [
              {
                $count: "total",
              },
            ],

            records: [
              {
                $sort: {
                  "latestPeriod.endDateExclusive": 1,
                  "member.fullName": 1,
                  _id: 1,
                },
              },

              {
                $skip: (page - 1) * limit,
              },

              {
                $limit: limit,
              },

              {
                $project: {
                  _id: 0,

                  memberId: "$_id",
                  membershipId:
                    "$latestPeriod._id",

                  memberName:
                    "$member.fullName",

                  memberReference:
                    "$member.memberId",

                  memberPhone:
                    "$member.phone",

                  planName:
                    "$latestPeriod.planName",

                  endDateExclusive:
                    "$latestPeriod.endDateExclusive",
                },
              },
            ],
          },
        },
      ]);

    const total =
      result?.metadata[0]?.total ?? 0;

    const records =
      result?.records ?? [];

    res.status(200).json({
      success: true,

      asOfDate: today,
      windowDays: days,

      data: records.map((record) => {
        // Convert exclusive expiry into the final
        // day the member can actually attend.
        const lastValidDate = addDays(
          record.endDateExclusive,
          -1
        );

        return {
          type: "MEMBERSHIP_EXPIRING",

          memberId:
            record.memberId.toString(),

          membershipId:
            record.membershipId.toString(),

          memberName: record.memberName,
          memberReference:
            record.memberReference,

          memberPhone:
            record.memberPhone ?? null,

          planName: record.planName,

          lastValidDate,

          daysRemaining: daysBetween(
            today,
            lastValidDate
          ),
        };
      }),

      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  };
