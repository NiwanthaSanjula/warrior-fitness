
import type { RequestHandler } from "express";
import type { Types } from "mongoose";

import { Member } from "../members/member.model.js";

import { Invoice } from "../billing/invoice.model.js";

import {
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  outstandingPaymentsQuerySchema,
} from "./attention.billing.validation.js";

interface OutstandingMemberRow {
  memberId: Types.ObjectId;

  memberName?: string | null;
  memberReference?: string | null;
  memberPhone?: string | null;
  memberProfileActive?: boolean | null;

  outstandingLkr: number;
  overdueLkr: number;

  openInvoiceCount: number;
  overdueInvoiceCount: number;

  oldestDueDate: string;
}

interface OutstandingTotals {
  totalMembers: number;
  totalOutstandingLkr: number;
  totalOverdueLkr: number;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
}

interface OutstandingAggregationResult {
  metadata: OutstandingTotals[];
  records: OutstandingMemberRow[];
}

function escapeRegex(value: string): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

// GET /api/attention/outstanding
export const getOutstandingPayments: RequestHandler =
  async (req, res) => {
    // 1. Validate query parameters.
    const parsed =
      outstandingPaymentsQuerySchema.safeParse(
        req.query
      );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message:
          "Invalid outstanding payment query",
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
      status,
      search,
      page,
      limit,
    } = parsed.data;

    // Use Sri Lanka's calendar date.
    const today = todayInColombo();

    // Escape search input before constructing
    // a case-insensitive regular expression.
    const regex = search
      ? new RegExp(escapeRegex(search), "i")
      : null;

    // 2. Calculate outstanding amounts
    // directly from the Invoice collection.
    const [result] =
      await Invoice.aggregate<OutstandingAggregationResult>([
        // An invoice contributes to the queue
        // only while it has an unpaid balance.
        {
          $match: {
            $expr: {
              $lt: [
                "$paidLkr",
                "$totalLkr",
              ],
            },
          },
        },

        // Outstanding = total - paid.
        {
          $addFields: {
            balanceLkr: {
              $subtract: [
                "$totalLkr",
                "$paidLkr",
              ],
            },
          },
        },

        // Combine unpaid invoices by member.
        {
          $group: {
            _id: "$member",

            outstandingLkr: {
              $sum: "$balanceLkr",
            },

            overdueLkr: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$dueDate",
                      today,
                    ],
                  },
                  "$balanceLkr",
                  0,
                ],
              },
            },

            openInvoiceCount: {
              $sum: 1,
            },

            overdueInvoiceCount: {
              $sum: {
                $cond: [
                  {
                    $lt: [
                      "$dueDate",
                      today,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            oldestDueDate: {
              $min: "$dueDate",
            },
          },
        },

        // Attach member profile details.
        {
          $lookup: {
            from: Member.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "member",
          },
        },

        {
          $unwind: {
            path: "$member",
            preserveNullAndEmptyArrays: true,
          },
        },

        // The overdue filter keeps members
        // with at least one overdue invoice.
        ...(status === "overdue"
          ? [
              {
                $match: {
                  overdueInvoiceCount: {
                    $gt: 0,
                  },
                },
              },
            ]
          : []),

        // Search member details.
        ...(regex
          ? [
              {
                $match: {
                  $or: [
                    {
                      "member.fullName": regex,
                    },
                    {
                      "member.memberId": regex,
                    },
                    {
                      "member.phone": regex,
                    },
                  ],
                },
              },
            ]
          : []),

        // Get summary totals and one page
        // from the same filtered result set.
        {
          $facet: {
            metadata: [
              {
                $group: {
                  _id: null,

                  totalMembers: {
                    $sum: 1,
                  },

                  totalOutstandingLkr: {
                    $sum: "$outstandingLkr",
                  },

                  totalOverdueLkr: {
                    $sum: "$overdueLkr",
                  },

                  openInvoiceCount: {
                    $sum: "$openInvoiceCount",
                  },

                  overdueInvoiceCount: {
                    $sum: "$overdueInvoiceCount",
                  },
                },
              },
            ],

            records: [
              // Highest overdue balances first.
              {
                $sort: {
                  overdueLkr: -1,
                  oldestDueDate: 1,
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

                  memberName: {
                    $ifNull: [
                      "$member.fullName",
                      null,
                    ],
                  },

                  memberReference: {
                    $ifNull: [
                      "$member.memberId",
                      null,
                    ],
                  },

                  memberPhone: {
                    $ifNull: [
                      "$member.phone",
                      null,
                    ],
                  },

                  memberProfileActive: {
                    $ifNull: [
                      "$member.isActive",
                      null,
                    ],
                  },

                  outstandingLkr: 1,
                  overdueLkr: 1,

                  openInvoiceCount: 1,
                  overdueInvoiceCount: 1,

                  oldestDueDate: 1,
                },
              },
            ],
          },
        },
      ]);

    const totals = result?.metadata[0];

    const records = result?.records ?? [];

    const total = totals?.totalMembers ?? 0;

    // 3. Return member-level payment alerts.
    res.status(200).json({
      success: true,

      asOfDate: today,
      currency: "LKR",

      status,
      search,

      summary: {
        membersWithOutstanding: total,

        totalOutstandingLkr:
          totals?.totalOutstandingLkr ?? 0,

        totalOverdueLkr:
          totals?.totalOverdueLkr ?? 0,

        openInvoiceCount:
          totals?.openInvoiceCount ?? 0,

        overdueInvoiceCount:
          totals?.overdueInvoiceCount ?? 0,
      },

      data: records.map((record) => ({
        type: "PAYMENT_OUTSTANDING",

        memberId:
          record.memberId.toString(),

        memberName: record.memberName ?? null,

        memberReference:
          record.memberReference ?? null,

        memberPhone:
          record.memberPhone ?? null,

        memberProfileActive:
          record.memberProfileActive ?? null,

        outstandingLkr:
          record.outstandingLkr,

        overdueLkr: record.overdueLkr,

        openInvoiceCount:
          record.openInvoiceCount,

        overdueInvoiceCount:
          record.overdueInvoiceCount,

        oldestDueDate:
          record.oldestDueDate,

        hasOverduePayments:
          record.overdueInvoiceCount > 0,
      })),

      total,
      page,
      limit,

      totalPages: Math.ceil(
        total / limit
      ),
    });
  };
