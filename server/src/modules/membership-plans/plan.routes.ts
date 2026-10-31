
import { Router } from "express";
import { requirePermission } from "../../middlewares/permission.middleware.js";

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
planRouter.get("/", requirePermission("plans.read"), getPlans);

planRouter.get("/:id", requirePermission("plans.read"), getPlanById);

// Only admins can create membership plans.
planRouter.post(
  "/",
  requireRole("ADMIN"),
  requirePermission("plans.manage"),
  createPlan
);
// Admin only: edit plan details.
planRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  requirePermission("plans.manage"),
  updatePlan
);

// Admin only: change plan availability.
planRouter.patch(
  "/:id/status",
  requireRole("ADMIN"),
  requirePermission("plans.manage"),
  updatePlanStatus
);
