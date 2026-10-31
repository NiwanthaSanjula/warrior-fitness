
import type { RequestHandler } from "express";

import { Payment } from "../billing/payment.model.js";

import {
  addDays,
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  collectionsQuerySchema,
} from "./reports.validation.js";

type PaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "CARD";

interface CollectionTotal {
  totalCollectedLkr: number;
  paymentCount: number;
}

interface MethodTotal extends CollectionTotal {
  _id: PaymentMethod;
}

interface DailyTotal extends CollectionTotal {
  _id: string;
}

interface CollectionsAggregation {
  overall: CollectionTotal[];
  byMethod: MethodTotal[];
  byDay: DailyTotal[];
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "CASH",
  "BANK_TRANSFER",
  "CARD",
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Converts a Sri Lankan date-only value into
 * the UTC instant when that date begins.
 *
 * For the current Sri Lankan reporting period:
 * Asia/Colombo = UTC+05:30.
 */
function colomboDayStartUtc(date: string): Date {
  const utcMidnight = Date.parse(
    `${date}T00:00:00.000Z`
  );

  return new Date(
    utcMidnight - 330 * 60 * 1000
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

  return (
    Math.round((toMs - fromMs) / ONE_DAY_MS) + 1
  );
}

function queryError(
  res: Parameters<RequestHandler>[1],
  message: string
) {
  res.status(400).json({
    success: false,
    message,
  });
}

// GET /api/reports/revenue/collections
export const getRevenueCollections: RequestHandler =
  async (req, res) => {
    // 1. Validate the query parameters.
    const parsed = collectionsQuerySchema.safeParse(
      req.query
    );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid report query parameters",
        errors: parsed.error.issues.map(
          (issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })
        ),
      });
      return;
    }

    // 2. Resolve the reporting period.
    const today = todayInColombo();

    const to = parsed.data.to ?? today;

    const from =
      parsed.data.from ?? addDays(to, -29);

    if (from > to) {
      queryError(
        res,
        "Start date must be on or before end date"
      );
      return;
    }

    if (to > today) {
      queryError(
        res,
        "Report end date cannot be in the future"
      );
      return;
    }

    const numberOfDays = calendarDaysInclusive(
      from,
      to
    );

    if (numberOfDays > 366) {
      queryError(
        res,
        "Report period cannot exceed 366 days"
      );
      return;
    }

    // 3. Filter by UTC instants corresponding
    // to local Sri Lankan calendar boundaries.
    //
    // Start: inclusive
    // End: exclusive
    const startUtc = colomboDayStartUtc(from);

    const endUtcExclusive = colomboDayStartUtc(
      addDays(to, 1)
    );

    // 4. Aggregate successfully recorded
    // payment documents in the selected period.
    const [result] =
      await Payment.aggregate<CollectionsAggregation>([
        {
          $match: {
            receivedAt: {
              $gte: startUtc,
              $lt: endUtcExclusive,
            },
          },
        },

        {
          $facet: {
            // Total payments and total money received.
            overall: [
              {
                $group: {
                  _id: null,

                  totalCollectedLkr: {
                    $sum: "$amountLkr",
                  },

                  paymentCount: {
                    $sum: 1,
                  },
                },
              },
            ],

            // Totals by payment method.
            byMethod: [
              {
                $group: {
                  _id: "$method",

                  totalCollectedLkr: {
                    $sum: "$amountLkr",
                  },

                  paymentCount: {
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

            // Group the recorded UTC timestamps
            // into Sri Lankan calendar dates.
            byDay: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      date: "$receivedAt",
                      format: "%Y-%m-%d",
                      timezone: "Asia/Colombo",
                    },
                  },

                  totalCollectedLkr: {
                    $sum: "$amountLkr",
                  },

                  paymentCount: {
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
      totalCollectedLkr: 0,
      paymentCount: 0,
    };

    const methodTotals = new Map(
      (result?.byMethod ?? []).map((item) => [
        item._id,
        item,
      ])
    );

    const dayTotals = new Map(
      (result?.byDay ?? []).map((item) => [
        item._id,
        item,
      ])
    );

    // 5. Return all three payment methods,
    // including those without transactions.
    const byMethod = PAYMENT_METHODS.map(
      (method) => {
        const item = methodTotals.get(method);

        return {
          method,

          totalCollectedLkr:
            item?.totalCollectedLkr ?? 0,

          paymentCount:
            item?.paymentCount ?? 0,
        };
      }
    );

    // 6. Include zero-collection dates so
    // frontend charts have no missing days.
    const byDay = Array.from(
      { length: numberOfDays },
      (_, index) => {
        const date = addDays(from, index);

        const item = dayTotals.get(date);

        return {
          date,

          totalCollectedLkr:
            item?.totalCollectedLkr ?? 0,

          paymentCount:
            item?.paymentCount ?? 0,
        };
      }
    );

    // 7. Send the report to the frontend.
    res.status(200).json({
      success: true,

      reportType: "PAYMENT_COLLECTIONS",
      currency: "LKR",
      timezone: "Asia/Colombo",

      period: {
        from,
        to,
        days: numberOfDays,
      },

      summary: {
        totalCollectedLkr:
          overall.totalCollectedLkr,

        paymentCount:
          overall.paymentCount,

        averagePaymentLkr:
          overall.paymentCount > 0
            ? overall.totalCollectedLkr /
              overall.paymentCount
            : 0,
      },

      byMethod,
      byDay,
    });
  };
