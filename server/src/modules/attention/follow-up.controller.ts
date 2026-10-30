
import type { RequestHandler } from "express";
import type { Types } from "mongoose";

import { Member } from "../members/member.model.js";

import {
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  FollowUp,
  toPublicFollowUp,
  type IFollowUp,
  type FollowUpType,
} from "./follow-up.model.js";

import {
  createFollowUpSchema,
  memberFollowUpQuerySchema,
  dueFollowUpQuerySchema,
  type CreateFollowUpInput,
} from "./follow-up.validation.js";

const objectIdPattern = /^[a-fA-F0-9]{24}$/;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function matchesRequest(
  followUp: IFollowUp,
  input: CreateFollowUpInput,
  staffId: string
): boolean {
  return (
    followUp.member.toString().toLowerCase() ===
      input.memberId.toLowerCase() &&
    followUp.handledBy.toString() === staffId &&
    followUp.alertType === input.alertType &&
    followUp.method === input.method &&
    followUp.outcome === input.outcome &&
    followUp.notes === input.notes &&
    followUp.nextFollowUpDate ===
      (input.nextFollowUpDate ?? null)
  );
}

// POST /api/attention/follow-ups
export const createFollowUp: RequestHandler =
  async (req, res) => {
    const parsed = createFollowUpSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid follow-up information",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          message: issue.message,
        })),
      });
      return;
    }

    if (!req.staff) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const input = parsed.data;
    const staffId = req.staff.id;

    // Check for an already completed request.
    const existing = await FollowUp.findOne({
      requestId: input.requestId,
    });

    if (existing) {
      if (!matchesRequest(existing, input, staffId)) {
        res.status(409).json({
          success: false,
          message:
            "This request ID belongs to another follow-up action",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Follow-up already recorded",
        replayed: true,
        data: toPublicFollowUp(existing),
      });
      return;
    }

    // Validate the date AFTER replay checking.
    const today = todayInColombo();

    if (
      input.nextFollowUpDate &&
      input.nextFollowUpDate < today
    ) {
      res.status(400).json({
        success: false,
        message:
          "Next follow-up date cannot be in the past",
      });
      return;
    }

    const memberExists = await Member.exists({
      _id: input.memberId,
    });

    if (!memberExists) {
      res.status(404).json({
        success: false,
        message: "Member not found",
      });
      return;
    }

    try {
      const followUp = await FollowUp.create({
        requestId: input.requestId,

        member: input.memberId,
        alertType: input.alertType,

        method: input.method,
        outcome: input.outcome,
        notes: input.notes,

        nextFollowUpDate:
          input.nextFollowUpDate ?? null,

        handledBy: staffId,
        recordedAt: new Date(),
      });

      res.status(201).json({
        success: true,
        message: "Follow-up recorded successfully",
        replayed: false,
        data: toPublicFollowUp(followUp),
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      // Handle simultaneous submissions
      // using the same request ID.
      const completed = await FollowUp.findOne({
        requestId: input.requestId,
      });

      if (
        completed &&
        matchesRequest(completed, input, staffId)
      ) {
        res.status(200).json({
          success: true,
          message: "Follow-up already recorded",
          replayed: true,
          data: toPublicFollowUp(completed),
        });
        return;
      }

      res.status(409).json({
        success: false,
        message:
          "Follow-up request conflict. Review history before retrying.",
      });
    }
  };

// GET /api/attention/follow-ups/member/:memberId
export const getMemberFollowUps: RequestHandler =
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
      memberFollowUpQuerySchema.safeParse(
        req.query
      );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid follow-up history query",
      });
      return;
    }

    const member = await Member.findById(memberId);

    if (!member) {
      res.status(404).json({
        success: false,
        message: "Member not found",
      });
      return;
    }

    const {
      alertType,
      page,
      limit,
    } = parsed.data;

    const filter = {
      member: member._id,
      ...(alertType !== "all"
        ? { alertType }
        : {}),
    };

    const [records, total] = await Promise.all([
      FollowUp.find(filter)
        .sort({
          recordedAt: -1,
          _id: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit),

      FollowUp.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,

      member: {
        id: member.id,
        memberReference: member.memberId,
        fullName: member.fullName,
      },

      data: records.map(toPublicFollowUp),

      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  };

interface DueFollowUpRow {
  _id: Types.ObjectId;
  member: Types.ObjectId;

  alertType: FollowUpType;
  method: IFollowUp["method"];
  outcome: IFollowUp["outcome"];
  notes: string;

  nextFollowUpDate: string;
  recordedAt: Date;
  handledBy: Types.ObjectId;

  memberName: string | null;
  memberReference: string | null;
  memberPhone: string | null;
}

interface DueAggregationResult {
  metadata: Array<{ total: number }>;
  records: DueFollowUpRow[];
}

// GET /api/attention/follow-ups/due
export const getDueFollowUps: RequestHandler =
  async (req, res) => {
    const parsed =
      dueFollowUpQuerySchema.safeParse(
        req.query
      );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid due follow-up query",
      });
      return;
    }

    const { page, limit } = parsed.data;
    const today = todayInColombo();

    const [result] =
      await FollowUp.aggregate<DueAggregationResult>([
        // Most recent action for every
        // member and attention category.
        {
          $sort: {
            recordedAt: -1,
            _id: -1,
          },
        },

        {
          $group: {
            _id: {
              member: "$member",
              alertType: "$alertType",
            },

            latest: {
              $first: "$$ROOT",
            },
          },
        },

        {
          $replaceRoot: {
            newRoot: "$latest",
          },
        },

        // A newer record without a scheduled date
        // removes the previous action from the
        // active due queue.
        {
          $match: {
            nextFollowUpDate: {
              $type: "string",
              $lte: today,
            },
          },
        },

        {
          $lookup: {
            from: Member.collection.name,
            localField: "member",
            foreignField: "_id",
            as: "memberProfile",
          },
        },

        {
          $unwind: {
            path: "$memberProfile",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $sort: {
            nextFollowUpDate: 1,
            recordedAt: 1,
            _id: 1,
          },
        },

        {
          $facet: {
            metadata: [
              { $count: "total" },
            ],

            records: [
              {
                $skip: (page - 1) * limit,
              },

              {
                $limit: limit,
              },

              {
                $project: {
                  _id: 1,
                  member: 1,

                  alertType: 1,
                  method: 1,
                  outcome: 1,
                  notes: 1,

                  nextFollowUpDate: 1,
                  recordedAt: 1,
                  handledBy: 1,

                  memberName: {
                    $ifNull: [
                      "$memberProfile.fullName",
                      null,
                    ],
                  },

                  memberReference: {
                    $ifNull: [
                      "$memberProfile.memberId",
                      null,
                    ],
                  },

                  memberPhone: {
                    $ifNull: [
                      "$memberProfile.phone",
                      null,
                    ],
                  },
                },
              },
            ],
          },
        },
      ]);

    const records = result?.records ?? [];
    const total = result?.metadata[0]?.total ?? 0;

    res.status(200).json({
      success: true,
      asOfDate: today,

      data: records.map((item) => ({
        followUpId: item._id.toString(),
        memberId: item.member.toString(),

        memberName: item.memberName,
        memberReference: item.memberReference,
        memberPhone: item.memberPhone,

        alertType: item.alertType,

        lastMethod: item.method,
        lastOutcome: item.outcome,
        lastNotes: item.notes,

        nextFollowUpDate: item.nextFollowUpDate,
        lastRecordedAt:
          item.recordedAt.toISOString(),

        handledBy: item.handledBy.toString(),
      })),

      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  };
