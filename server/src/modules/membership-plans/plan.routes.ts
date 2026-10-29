
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  createPlan,
  getPlans,
} from "./plan.controller.js";

export const planRouter = Router();

// Only authenticated gym staff can
// access membership plan endpoints.
planRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

// Both roles can retrieve permitted plans.
planRouter.get("/", getPlans);

// Only admins can create membership plans.
planRouter.post(
  "/",
  requireRole("ADMIN"),
  createPlan
);
