import type { RequestHandler } from "express";
import { z } from "zod";

import { Member } from "../members/member.model.js";
import { todayInColombo } from "../memberships/membership.dates.js";

import {
  Invoice,
  toPublicInvoice,
  type IInvoice,
} from "./invoice.model.js";

const listQuerySchema = z.strictObject({
  status: z.enum([
    "all",
    "unpaid",
    "partial",
    "paid",
    "overdue",
  ]).default("all"),

  search: z.string().trim().max(80).default(""),

  page: z.coerce.number()
    .int().min(1).default(1),

  limit: z.coerce.number()
    .int().min(1).max(50).default(10),
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/invoices
export const getAllInvoices: RequestHandler =
  async (req, res) => {
    const parsed = listQuerySchema.safeParse(
      req.query
    );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid invoice query",
      });
      return;
    }

    const {
      status,
      search,
      page,
      limit,
    } = parsed.data;

    const conditions: Record<string, any>[] = [];
    const today = todayInColombo();

    if (status === "unpaid") {
      conditions.push({ paidLkr: 0 });
    }

    if (status === "partial") {
      conditions.push({
        paidLkr: { $gt: 0 },
        $expr: {
          $lt: ["$paidLkr", "$totalLkr"],
        },
      });
    }

    if (status === "paid") {
      conditions.push({
        $expr: {
          $gte: ["$paidLkr", "$totalLkr"],
        },
      });
    }

    if (status === "overdue") {
      conditions.push({
        dueDate: { $lt: today },
        $expr: {
          $lt: ["$paidLkr", "$totalLkr"],
        },
      });
    }

    if (search) {
      const regex = new RegExp(
        escapeRegex(search),
        "i"
      );

      // Search either invoice reference or
      // member information.
      const matchingMembers = await Member.find({
        $or: [
          { fullName: regex },
          { memberId: regex },
          { phone: regex },
        ],
      })
        .select("_id")
        .lean();

      conditions.push({
        $or: [
          { invoiceNumber: regex },
          {
            member: {
              $in: matchingMembers.map(
                (member) => member._id
              ),
            },
          },
        ],
      });
    }

    const filter: Record<string, any> =
      conditions.length > 0
        ? { $and: conditions }
        : {};

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),

      Invoice.countDocuments(filter),
    ]);

    // Fetch names in one query instead of
    // querying the database for every invoice.
    const members = await Member.find({
      _id: {
        $in: invoices.map(
          (invoice) => invoice.member
        ),
      },
    })
      .select("fullName memberId")
      .lean();

    const memberMap = new Map(
      members.map((member) => [
        member._id.toString(),
        {
          fullName: member.fullName,
          memberId: member.memberId,
        },
      ])
    );

    res.status(200).json({
      success: true,

      data: invoices.map((invoice) => {
        const member = memberMap.get(
          invoice.member.toString()
        );

        return {
          ...toPublicInvoice(invoice, today),

          memberName: member?.fullName ?? null,
          memberReference: member?.memberId ?? null,
        };
      }),

      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  };

// GET /api/invoices/overview
export const getBillingOverview: RequestHandler =
  async (_req, res) => {
    const today = todayInColombo();

    const [summary] = await Invoice.aggregate([
      {
        $group: {
          _id: null,

          invoiceCount: { $sum: 1 },

          billedLkr: {
            $sum: "$totalLkr",
          },

          collectedLkr: {
            $sum: "$paidLkr",
          },

          outstandingLkr: {
            $sum: {
              $subtract: [
                "$totalLkr",
                "$paidLkr",
              ],
            },
          },

          overdueCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $lt: ["$dueDate", today] },
                    {
                      $lt: [
                        "$paidLkr",
                        "$totalLkr",
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
    ]);

    res.status(200).json({
      success: true,

      data: {
        invoiceCount: summary?.invoiceCount ?? 0,
        billedLkr: summary?.billedLkr ?? 0,
        collectedLkr: summary?.collectedLkr ?? 0,
        outstandingLkr:
          summary?.outstandingLkr ?? 0,
        overdueCount:
          summary?.overdueCount ?? 0,

        currency: "LKR",
      },
    });
  };