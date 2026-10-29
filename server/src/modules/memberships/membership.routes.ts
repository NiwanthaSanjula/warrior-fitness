
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  createEnrollment,
  getMemberMemberships,
} from "./membership.controller.js";

export const membershipRouter = Router();

membershipRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

// Create a member's first purchased membership.
membershipRouter.post(
  "/",
  createEnrollment
);

// Read membership records for a given member.
membershipRouter.get(
  "/member/:memberId",
  getMemberMemberships
);
