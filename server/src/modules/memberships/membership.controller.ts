
import mongoose from "mongoose";

import {
  createInvoiceForMembership,
} from "../billing/invoice.service.js";

import {
  toPublicInvoice,
} from "../billing/invoice.model.js";

import type { RequestHandler } from "express";

import { Member } from "../members/member.model.js";

import { MembershipPlan } from
  "../membership-plans/plan.model.js";

import {
  Membership,
  toPublicMembership,
} from "./membership.model.js";

import {
  createEnrollmentSchema,
} from "./membership.validation.js";

import {
  addDays,
  calculateEndDateExclusive,
  todayInColombo,
} from "./membership.dates.js";

const objectIdPattern = /^[a-fA-F0-9]{24}$/;

// POST /api/memberships
export const createEnrollment: RequestHandler =
  async (req, res) => {
    const parsed = createEnrollmentSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Enrollment validation failed",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
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

    const { memberId, planId } = parsed.data;

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
        message: "Cannot enroll an inactive member",
      });
      return;
    }

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
          "This plan is unavailable for new enrollments",
      });
      return;
    }

    const today = todayInColombo();
    const startDate = parsed.data.startDate ?? today;

    // No backdated enrollment in the MVP.
    if (startDate < today) {
      res.status(400).json({
        success: false,
        message:
          "Membership start date cannot be in the past",
      });
      return;
    }

    // Allow scheduling a first membership
    // up to 30 days into the future.
    if (startDate > addDays(today, 30)) {
      res.status(400).json({
        success: false,
        message:
          "Start date cannot be more than 30 days ahead",
      });
      return;
    }

    // The first enrollment is a one-time operation.
    // Renewals will use a separate endpoint.
    const existingInitial = await Membership.exists({
      member: member._id,
      enrollmentType: "INITIAL",
    });

    if (existingInitial) {
      res.status(409).json({
        success: false,
        message:
          "This member has already been enrolled. Use the renewal workflow for additional membership periods.",
      });
      return;
    }

    const endDateExclusive =
      calculateEndDateExclusive(
        startDate,
        plan.durationUnit,
        plan.durationCount
      );

    const staffId = req.staff.id;
    
    try {
      const { membership, invoice } =
      await mongoose.connection.transaction(
        async (session) => {
          // Build the new membership exactly as before.
          const membership = new Membership({
            member: member._id,
            plan: plan._id,

            enrollmentType: "INITIAL",

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

          // Write 1: Save membership.
          await membership.save({ session });

          // Write 2: Save its invoice in the
          // SAME MongoDB transaction.
          const invoice =
            await createInvoiceForMembership(
              membership,
              staffId,
              session
            );

          return { membership, invoice };
        }
      );

    // This response is reached after the
    // transaction has successfully committed.
    res.status(201).json({
      success: true,
      message: "Member enrolled successfully",

      // Keep the old response structure so
      // the existing React page still works.
      data: toPublicMembership(
        membership,
        today
      ),

      // Additional billing information.
      invoice: toPublicInvoice(invoice, today),
    });
    } catch (error: unknown) {
      // Also handle concurrent duplicate requests.
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(409).json({
          success: false,
          message:
            "An initial enrollment already exists for this member",
        });
        return;
      }

      throw error;
    }
  };

// GET /api/memberships/member/:memberId
export const getMemberMemberships: RequestHandler =
  async (req, res) => {
    const memberId = req.params.memberId as string;

    if (!objectIdPattern.test(memberId)) {
      res.status(400).json({
        success: false,
        message: "Invalid member ID",
      });
      return;
    }

    const memberExists = await Member.exists({
      _id: memberId,
    });

    if (!memberExists) {
      res.status(404).json({
        success: false,
        message: "Member not found",
      });
      return;
    }

    const memberships = await Membership.find({
      member: memberId,
    }).sort({
      startDate: -1,
      createdAt: -1,
    });

    const today = todayInColombo();

    res.status(200).json({
      success: true,
      data: memberships.map((membership) =>
        toPublicMembership(membership, today)
      ),
      total: memberships.length,
    });
  };
