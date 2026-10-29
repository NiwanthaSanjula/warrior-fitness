
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  createEnrollment,
  getMemberMemberships,
} from "./membership.controller.js";

import {
  renewMembership,
  getMembershipSummary,
} from "./membership.renewal.controller.js";

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

// Renew an existing membership.
membershipRouter.post(
  "/renew",
  renewMembership
);

// Current membership, upcoming renewal,
// latest period and overall status.
membershipRouter.get(
  "/member/:memberId/summary",
  getMembershipSummary
);

// Complete membership history.
membershipRouter.get(
  "/member/:memberId",
  getMemberMemberships
);
