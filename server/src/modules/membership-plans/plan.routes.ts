
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  createPlan,
  getPlans,
} from "./plan.controller.js";

import {
  getPlanById,
  updatePlan,
  updatePlanStatus,
} from "./plan.management.controller.js";

export const planRouter = Router();

// Only authenticated gym staff can
// access membership plan endpoints.
planRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

// Both roles can retrieve permitted plans.
planRouter.get("/", getPlans);

planRouter.get("/:id", getPlanById);

// Only admins can create membership plans.
planRouter.post(
  "/",
  requireRole("ADMIN"),
  createPlan
);
// Admin only: edit plan details.
planRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  updatePlan
);

// Admin only: change plan availability.
planRouter.patch(
  "/:id/status",
  requireRole("ADMIN"),
  updatePlanStatus
);
