
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

      res.status(200).json({
        success: true,
        message: "Renewal already processed",
        replayed: true,
        data: toPublicMembership(previousRequest),
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

    // Find the last purchased membership period.
    // We use the latest END date, not simply
    // the record created most recently.
    const latestMembership = await Membership.findOne({
      member: member._id,
    }).sort({
      endDateExclusive: -1,
      startDate: -1,
      _id: -1,
    });

    if (!latestMembership) {
      res.status(409).json({
        success: false,
        message: "No previous membership found",
      });
      return;
    }

    const today = todayInColombo();

    // Early renewal: start after the last
    // purchased period, preserving unused days.
    //
    // Expired membership: start today.
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

    // Application-level overlap check.
    const overlap = await Membership.exists({
      member: member._id,
      startDate: { $lt: endDateExclusive },
      endDateExclusive: { $gt: startDate },
    });

    if (overlap) {
      res.status(409).json({
        success: false,
        message:
          "The proposed renewal overlaps an existing membership period",
      });
      return;
    }

    try {
      const renewal = await Membership.create({
        member: member._id,
        plan: plan._id,

        enrollmentType: "RENEWAL",
        renewalRequestId: requestId,

        // Keep the purchased terms unchanged.
        planSnapshot: {
          code: plan.code,
          name: plan.name,
          durationUnit: plan.durationUnit,
          durationCount: plan.durationCount,
          priceLkr: plan.priceLkr,
        },

        startDate,
        endDateExclusive,

        enrolledBy: req.staff.id,
      });

      res.status(201).json({
        success: true,
        message: "Membership renewed successfully",
        replayed: false,
        data: toPublicMembership(renewal, today),
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      // Another request may have completed
      // while this one was being processed.
      const completedRequest = await Membership.findOne({
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
        res.status(200).json({
          success: true,
          message: "Renewal already processed",
          replayed: true,
          data: toPublicMembership(
            completedRequest,
            today
          ),
        });
        return;
      }

      res.status(409).json({
        success: false,
        message:
          "Another renewal was processed for this period. Refresh membership history before retrying.",
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
