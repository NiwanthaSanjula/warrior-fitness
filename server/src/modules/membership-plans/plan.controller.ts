
import type { RequestHandler } from "express";
import {
  MembershipPlan,
  toPublicPlan,
  type IMembershipPlan,
} from "./plan.model.js";

import {
  createPlanSchema,
  planListQuerySchema,
} from "./plan.validation.js";

// POST /api/plans
export const createPlan: RequestHandler = async (
  req,
  res
) => {
  const parsed = createPlanSchema.safeParse(
    req.body
  );

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Plan validation failed",
      errors: parsed.error.issues.map(
        (issue) => ({
          field: issue.path.join(".") || "body",
          message: issue.message,
        })
      ),
    });
    return;
  }

  // Defense in depth.
  if (!req.staff || req.staff.role !== "ADMIN") {
    res.status(403).json({
      success: false,
      message: "Admin access required",
    });
    return;
  }

  const data = parsed.data;

  // Prevent duplicate plan codes.
  const existingPlan =
    await MembershipPlan.exists({
      code: data.code,
    });

  if (existingPlan) {
    res.status(409).json({
      success: false,
      message:
        "A membership plan with this code already exists",
    });
    return;
  }

  const plan = await MembershipPlan.create({
    code: data.code,
    name: data.name,
    description: data.description,

    durationUnit: data.durationUnit,
    durationCount: data.durationCount,

    priceLkr: data.priceLkr,
    isActive: true,

    createdBy: req.staff.id,
  });

  res.status(201).json({
    success: true,
    message: "Membership plan created successfully",
    data: toPublicPlan(plan),
  });
};

// GET /api/plans
export const getPlans: RequestHandler = async (
  req,
  res
) => {
  const parsed = planListQuerySchema.safeParse(
    req.query
  );

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid plan query parameters",
    });
    return;
  }

  const { status } = parsed.data;

  // Receptionists may view active plans only.
  if (
    req.staff?.role !== "ADMIN" &&
    status !== "active"
  ) {
    res.status(403).json({
      success: false,
      message:
        "You do not have permission to view inactive plans",
    });
    return;
  }

  const filter: { isActive?: boolean } = {};

  if (status === "active") {
    filter.isActive = true;
  } else if (status === "inactive") {
    filter.isActive = false;
  }

  const plans = await MembershipPlan.find(filter)
    .sort({
      createdAt: -1,
      _id: -1,
    });

  res.status(200).json({
    success: true,
    data: plans.map(toPublicPlan),
    total: plans.length,
  });
};
