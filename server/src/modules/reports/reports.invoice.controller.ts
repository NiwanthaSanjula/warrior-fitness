
import type { RequestHandler } from "express";

import { Invoice } from "../billing/invoice.model.js";

import {
  addDays,
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  collectionsQuerySchema,
} from "./reports.validation.js";

const ONE_DAY_MS = 86_400_000;

interface InvoiceDayTotal {
  _id: string;
  totalInvoicedLkr: number;
  invoiceCount: number;
}

interface InvoiceOverall {
  totalInvoicedLkr: number;
  invoiceCount: number;
}

interface InvoiceIssueAggregation {
  overall: InvoiceOverall[];
  byDay: InvoiceDayTotal[];
}

interface ReceivablesAggregation {
  totalOutstandingLkr: number;
  overdueLkr: number;
  notYetOverdueLkr: number;
  undatedOutstandingLkr: number;

  openInvoiceCount: number;
  overdueInvoiceCount: number;
  partiallyPaidInvoiceCount: number;
  membersWithOutstanding: number;
}

// Converts a Sri Lankan calendar date to
// its starting instant in UTC.
//
// Sri Lanka currently uses UTC+05:30.
function colomboDayStartUtc(
  date: string
): Date {
  const midnightUtc = Date.parse(
    `${date}T00:00:00.000Z`
  );

  return new Date(
    midnightUtc - 330 * 60 * 1000
  );
}

function calendarDaysInclusive(
  from: string,
  to: string
): number {
  const fromMs = Date.parse(
    `${from}T00:00:00.000Z`
  );

  const toMs = Date.parse(
    `${to}T00:00:00.000Z`
  );

  return Math.round(
    (toMs - fromMs) / ONE_DAY_MS
  ) + 1;
}

/**
 * GET /api/reports/revenue/invoices
 *
 * Reports invoices CREATED in a date range.
 * This is not a collections report.
 */
export const getInvoiceIssuanceReport: RequestHandler =
  async (req, res) => {
    const parsed =
      collectionsQuerySchema.safeParse(
        req.query
      );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid invoice report query",
        errors: parsed.error.issues.map(
          (issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })
        ),
      });
      return;
    }

    const today = todayInColombo();

    const to = parsed.data.to ?? today;
    const from =
      parsed.data.from ?? addDays(to, -29);

    if (from > to) {
      res.status(400).json({
        success: false,
        message:
          "Start date must be on or before end date",
      });
      return;
    }

    if (to > today) {
      res.status(400).json({
        success: false,
        message:
          "Report end date cannot be in the future",
      });
      return;
    }

    const days = calendarDaysInclusive(
      from,
      to
    );

    if (days > 366) {
      res.status(400).json({
        success: false,
        message:
          "Report period cannot exceed 366 days",
      });
      return;
    }

    const startUtc = colomboDayStartUtc(from);

    const endUtcExclusive =
      colomboDayStartUtc(
        addDays(to, 1)
      );

    // Invoice creation dates are the source
    // for this report, NOT payment dates.
    const [result] =
      await Invoice.aggregate<InvoiceIssueAggregation>([
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
            overall: [
              {
                $group: {
                  _id: null,

                  totalInvoicedLkr: {
                    $sum: "$totalLkr",
                  },

                  invoiceCount: {
                    $sum: 1,
                  },
                },
              },
            ],

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

                  totalInvoicedLkr: {
                    $sum: "$totalLkr",
                  },

                  invoiceCount: {
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

    const overall = result?.overall[0] ?? {
      totalInvoicedLkr: 0,
      invoiceCount: 0,
    };

    const dayMap = new Map(
      (result?.byDay ?? []).map(
        (item) => [item._id, item]
      )
    );

    // Generate all dates including those
    // where no invoices were created.
    const byDay = Array.from(
      { length: days },
      (_, index) => {
        const date = addDays(from, index);
        const day = dayMap.get(date);

        return {
          date,

          totalInvoicedLkr:
            day?.totalInvoicedLkr ?? 0,

          invoiceCount:
            day?.invoiceCount ?? 0,
        };
      }
    );

    res.status(200).json({
      success: true,

      reportType: "INVOICE_ISSUANCE",
      currency: "LKR",
      timezone: "Asia/Colombo",

      period: {
        from,
        to,
        days,
      },

      summary: {
        totalInvoicedLkr:
          overall.totalInvoicedLkr,

        invoiceCount:
          overall.invoiceCount,

        averageInvoiceLkr:
          overall.invoiceCount > 0
            ? overall.totalInvoicedLkr /
              overall.invoiceCount
            : 0,
      },

      byDay,
    });
  };

/**
 * GET /api/reports/revenue/receivables
 *
 * Current outstanding balance across
 * ALL invoices in the database.
 *
 * Not a historical balance snapshot.
 */
export const getReceivablesReport: RequestHandler =
  async (req, res) => {
    if (Object.keys(req.query).length > 0) {
      res.status(400).json({
        success: false,
        message:
          "Receivables is a current snapshot and does not accept date filters",
      });
      return;
    }

    const today = todayInColombo();

    const generatedAt =
      new Date().toISOString();

    const [result] =
      await Invoice.aggregate<ReceivablesAggregation>([
        // Calculate the remaining balance for
        // every invoice.
        {
          $project: {
            member: 1,
            dueDate: 1,
            paidLkr: 1,

            balanceLkr: {
              $max: [
                0,
                {
                  $subtract: [
                    {
                      $ifNull: [
                        "$totalLkr",
                        0,
                      ],
                    },
                    {
                      $ifNull: [
                        "$paidLkr",
                        0,
                      ],
                    },
                  ],
                },
              ],
            },

            // Existing MVP invoices should
            // store ISO date-only due dates.
            hasDueDate: {
              $eq: [
                { $type: "$dueDate" },
                "string",
              ],
            },
          },
        },

        // Ignore fully settled invoices.
        {
          $match: {
            balanceLkr: { $gt: 0 },
          },
        },

        {
          $group: {
            _id: null,

            totalOutstandingLkr: {
              $sum: "$balanceLkr",
            },

            // An invoice is overdue only when
            // its due date is BEFORE today.
            overdueLkr: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      "$hasDueDate",
                      {
                        $lt: [
                          "$dueDate",
                          today,
                        ],
                      },
                    ],
                  },
                  "$balanceLkr",
                  0,
                ],
              },
            },

            // Includes invoices due today.
            notYetOverdueLkr: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      "$hasDueDate",
                      {
                        $gte: [
                          "$dueDate",
                          today,
                        ],
                      },
                    ],
                  },
                  "$balanceLkr",
                  0,
                ],
              },
            },

            // Legacy records without a valid
            // due-date field are not assumed
            // to be overdue.
            undatedOutstandingLkr: {
              $sum: {
                $cond: [
                  {
                    $not: [
                      "$hasDueDate",
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
                    $and: [
                      "$hasDueDate",
                      {
                        $lt: [
                          "$dueDate",
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

            partiallyPaidInvoiceCount: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      "$paidLkr",
                      0,
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            distinctMembers: {
              $addToSet: "$member",
            },
          },
        },

        // Return a count rather than
        // transferring member IDs to the client.
        {
          $project: {
            _id: 0,

            totalOutstandingLkr: 1,
            overdueLkr: 1,
            notYetOverdueLkr: 1,
            undatedOutstandingLkr: 1,

            openInvoiceCount: 1,
            overdueInvoiceCount: 1,
            partiallyPaidInvoiceCount: 1,

            membersWithOutstanding: {
              $size: "$distinctMembers",
            },
          },
        },
      ]);

    res.status(200).json({
      success: true,

      reportType: "CURRENT_RECEIVABLES",
      currency: "LKR",
      timezone: "Asia/Colombo",

      asOfDate: today,
      generatedAt,

      summary: {
        totalOutstandingLkr:
          result?.totalOutstandingLkr ?? 0,

        overdueLkr:
          result?.overdueLkr ?? 0,

        notYetOverdueLkr:
          result?.notYetOverdueLkr ?? 0,

        undatedOutstandingLkr:
          result?.undatedOutstandingLkr ?? 0,

        openInvoiceCount:
          result?.openInvoiceCount ?? 0,

        overdueInvoiceCount:
          result?.overdueInvoiceCount ?? 0,

        partiallyPaidInvoiceCount:
          result?.partiallyPaidInvoiceCount ?? 0,

        membersWithOutstanding:
          result?.membersWithOutstanding ?? 0,
      },
    });
  };
