
import type { RequestHandler } from "express";
import type { ZodError } from "zod";

import {
  MembershipPlan,
  toPublicPlan,
} from "./plan.model.js";

import {
  createPlanSchema,
} from "./plan.validation.js";

import {
  updatePlanSchema,
  updatePlanStatusSchema,
} from "./plan.management.validation.js";

// Validate MongoDB ObjectId format.
function isValidObjectId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id);
}

// Format Zod validation errors.
function formatErrors(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "body",
    message: issue.message,
  }));
}

// GET /api/plans/:id
export const getPlanById: RequestHandler = async (
  req,
  res
) => {
  const id = req.params.id as string;

  if (!isValidObjectId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid membership plan ID",
    });
    return;
  }

  // Receptionists must not access inactive plans.
  // Return 404 for unavailable plans.
  const filter = {
    _id: id,
    ...(req.staff?.role === "ADMIN"
      ? {}
      : { isActive: true }),
  };

  const plan = await MembershipPlan.findOne(filter);

  if (!plan) {
    res.status(404).json({
      success: false,
      message: "Membership plan not found",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: toPublicPlan(plan),
  });
};

// PATCH /api/plans/:id
export const updatePlan: RequestHandler = async (
  req,
  res
) => {
  const id = req.params.id as string;

  if (!isValidObjectId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid membership plan ID",
    });
    return;
  }

  const parsed = updatePlanSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Plan update validation failed",
      errors: formatErrors(parsed.error),
    });
    return;
  }

  const plan = await MembershipPlan.findById(id);

  if (!plan) {
    res.status(404).json({
      success: false,
      message: "Membership plan not found",
    });
    return;
  }

  const changes = parsed.data;

  // Validate the entire resulting plan.
  // This handles relationships between duration
  // unit and duration count.
  const validated = createPlanSchema.safeParse({
    code: plan.code,

    name: changes.name ?? plan.name,

    description:
      changes.description ?? plan.description,

    durationUnit:
      changes.durationUnit ?? plan.durationUnit,

    durationCount:
      changes.durationCount ?? plan.durationCount,

    priceLkr:
      changes.priceLkr ?? plan.priceLkr,
  });

  if (!validated.success) {
    res.status(400).json({
      success: false,
      message: "Invalid resulting plan configuration",
      errors: formatErrors(validated.error),
    });
    return;
  }

  // Apply only validated values.
  plan.name = validated.data.name;
  plan.description = validated.data.description;
  plan.durationUnit = validated.data.durationUnit;
  plan.durationCount = validated.data.durationCount;
  plan.priceLkr = validated.data.priceLkr;

  // Mongoose runs document validation before save.
  await plan.save();

  res.status(200).json({
    success: true,
    message: "Membership plan updated successfully",
    data: toPublicPlan(plan),
  });
};

// PATCH /api/plans/:id/status
export const updatePlanStatus: RequestHandler = async (
  req,
  res
) => {
  const id = req.params.id as string;

  if (!isValidObjectId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid membership plan ID",
    });
    return;
  }

  const parsed = updatePlanStatusSchema.safeParse(
    req.body
  );

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid plan status",
      errors: formatErrors(parsed.error),
    });
    return;
  }

  const plan = await MembershipPlan.findById(id);

  if (!plan) {
    res.status(404).json({
      success: false,
      message: "Membership plan not found",
    });
    return;
  }

  plan.isActive = parsed.data.isActive;

  await plan.save();

  res.status(200).json({
    success: true,
    message: plan.isActive
      ? "Membership plan activated successfully"
      : "Membership plan deactivated successfully",
    data: toPublicPlan(plan),
  });
};
