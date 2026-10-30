
import mongoose from "mongoose";

import {
  Invoice,
  toPublicInvoice,
} from "../billing/invoice.model.js";

import {
  createInvoiceForMembership,
} from "../billing/invoice.service.js";

import type { RequestHandler } from "express";

import { Member } from "../members/member.model.js";

import { MembershipPlan } from
  "../membership-plans/plan.model.js";

import {
  Membership,
  toPublicMembership,
} from "./membership.model.js";

import {
  calculateEndDateExclusive,
  todayInColombo,
} from "./membership.dates.js";

import {
  renewMembershipSchema,
} from "./membership.renewal.validation.js";

const objectIdPattern = /^[a-fA-F0-9]{24}$/;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

// Check whether an existing renewal represents
// exactly the same intended request.
function isSameRenewalRequest(
  existing: {
    member: { toString(): string };
    plan: { toString(): string };
  },
  memberId: string,
  planId: string
): boolean {
  return (
    existing.member.toString().toLowerCase() ===
      memberId.toLowerCase() &&
    existing.plan.toString().toLowerCase() ===
      planId.toLowerCase()
  );
}
class RenewalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenewalConflictError";
  }
}


// POST /api/memberships/renew
export const renewMembership: RequestHandler =
  async (req, res) => {
    const parsed = renewMembershipSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Renewal validation failed",
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

    const {
      memberId,
      planId,
      requestId,
    } = parsed.data;

    // Idempotency: if this request was already
    // completed, return the existing renewal.
    const previousRequest = await Membership.findOne({
      renewalRequestId: requestId,
    });

    if (previousRequest) {
      if (
        !isSameRenewalRequest(
          previousRequest,
          memberId,
          planId
        )
      ) {
        res.status(409).json({
          success: false,
          message:
            "This request ID is already used for another renewal",
        });
        return;
      }
      
      const existingInvoice = await Invoice.findOne({
        membership: previousRequest._id,
      });
  
      res.status(200).json({
        success: true,
        message: "Renewal already processed",
        replayed: true,

        data: toPublicMembership(previousRequest),

        invoice: existingInvoice
          ? toPublicInvoice(existingInvoice)
          : null,
      });
      return;

    }

    // Verify member.
    const member = await Member.findById(memberId);

    if (!member) {
      res.status(404).json({
        success: false,
        message: "Member not found",
      });
      return;
    }

    if (!member.isActive) {
      res.status(409).json({
        success: false,
        message: "Cannot renew an inactive member",
      });
      return;
    }

    // Verify the new plan is available.
    const plan = await MembershipPlan.findById(planId);

    if (!plan) {
      res.status(404).json({
        success: false,
        message: "Membership plan not found",
      });
      return;
    }

    if (!plan.isActive) {
      res.status(409).json({
        success: false,
        message:
          "Cannot renew using an inactive membership plan",
      });
      return;
    }

    // The member must have an INITIAL enrollment.
    const initialExists = await Membership.exists({
      member: member._id,
      enrollmentType: "INITIAL",
    });

    if (!initialExists) {
      res.status(409).json({
        success: false,
        message:
          "Member has not been enrolled yet. Use initial enrollment first.",
      });
      return;
    }

    
    const today = todayInColombo();
    const staffId = req.staff.id;

    try {
      const { renewal, invoice } =
        await mongoose.connection.transaction(
          async (session) => {
            // Find the last purchased membership
            // WITHIN the transaction.
            const latestMembership =
              await Membership.findOne({
                member: member._id,
              })
                .sort({
                  endDateExclusive: -1,
                  startDate: -1,
                  _id: -1,
                })
                .session(session);

            if (!latestMembership) {
              throw new RenewalConflictError(
                "No previous membership found"
              );
            }

            // Renew early: preserve remaining days.
            // Expired: begin today.
            const startDate =
              latestMembership.endDateExclusive > today
                ? latestMembership.endDateExclusive
                : today;

            const endDateExclusive =
              calculateEndDateExclusive(
                startDate,
                plan.durationUnit,
                plan.durationCount
              );

            // Detect an overlapping period.
            const overlap = await Membership.exists({
              member: member._id,
              startDate: {
                $lt: endDateExclusive,
              },
              endDateExclusive: {
                $gt: startDate,
              },
            }).session(session);

            if (overlap) {
              throw new RenewalConflictError(
                "The proposed renewal overlaps an existing membership period"
              );
            }

            const renewal = new Membership({
              member: member._id,
              plan: plan._id,

              enrollmentType: "RENEWAL",
              renewalRequestId: requestId,

              planSnapshot: {
                code: plan.code,
                name: plan.name,
                durationUnit: plan.durationUnit,
                durationCount: plan.durationCount,
                priceLkr: plan.priceLkr,
              },

              startDate,
              endDateExclusive,
              enrolledBy: staffId,
            });

            // Write 1: Membership renewal.
            await renewal.save({ session });

            // Write 2: Its invoice.
            const invoice =
              await createInvoiceForMembership(
                renewal,
                staffId,
                session
              );

            return { renewal, invoice };
          }
        );

      res.status(201).json({
        success: true,
        message: "Membership renewed successfully",
        replayed: false,

        // Existing React API contract.
        data: toPublicMembership(renewal, today),

        // Additional billing information.
        invoice: toPublicInvoice(invoice, today),
      });
    } catch (error: unknown) {
      if (error instanceof RenewalConflictError) {
        res.status(409).json({
          success: false,
          message: error.message,
        });
        return;
      }

      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      // Handle a concurrent retry using the same
      // requestId after the transaction commits.
      const completedRequest =
        await Membership.findOne({
          renewalRequestId: requestId,
        });

      if (
        completedRequest &&
        isSameRenewalRequest(
          completedRequest,
          memberId,
          planId
        )
      ) {
        const existingInvoice =
          await Invoice.findOne({
            membership: completedRequest._id,
          });

        res.status(200).json({
          success: true,
          message: "Renewal already processed",
          replayed: true,

          data: toPublicMembership(
            completedRequest,
            today
          ),

          invoice: existingInvoice
            ? toPublicInvoice(existingInvoice, today)
            : null,
        });
        return;
      }

      // A different concurrent renewal may have
      // claimed the same membership start date.
      res.status(409).json({
        success: false,
        message:
          "Another renewal was processed. Refresh membership history before retrying.",
      });
    }

  };

// GET /api/memberships/member/:memberId/summary
export const getMembershipSummary: RequestHandler =
  async (req, res) => {
    const memberId = req.params.memberId as string;

    if (!objectIdPattern.test(memberId)) {
      res.status(400).json({
        success: false,
        message: "Invalid member ID",
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

    const today = todayInColombo();

    // Ordered by start date to identify current,
    // upcoming, and latest purchased periods.
    const memberships = await Membership.find({
      member: member._id,
    }).sort({
      startDate: 1,
      endDateExclusive: 1,
      _id: 1,
    });

    const current = memberships.find(
      (membership) =>
        membership.startDate <= today &&
        today < membership.endDateExclusive
    );

    const upcoming = memberships.find(
      (membership) =>
        membership.startDate > today
    );

    const latest =
      memberships.length > 0
        ? memberships[memberships.length - 1]
        : null;

    const status = current
      ? "ACTIVE"
      : upcoming
        ? "UPCOMING"
        : latest
          ? "EXPIRED"
          : "NOT_ENROLLED";

    res.status(200).json({
      success: true,
      data: {
        memberId: member.id,
        memberReference: member.memberId,
        memberProfileActive: member.isActive,

        status,
        totalPeriods: memberships.length,

        currentMembership: current
          ? toPublicMembership(current, today)
          : null,

        nextMembership: upcoming
          ? toPublicMembership(upcoming, today)
          : null,

        latestMembership: latest
          ? toPublicMembership(latest, today)
          : null,
      },
    });
  };
