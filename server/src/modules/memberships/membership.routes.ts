
import { Router } from "express";
import { requirePermission } from "../../middlewares/permission.middleware.js";

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
  requirePermission("memberships.enroll"),
  createEnrollment
);

// Renew an existing membership.
membershipRouter.post(
  "/renew",
  requirePermission("memberships.renew"),
  renewMembership
);

// Current membership, upcoming renewal,
// latest period and overall status.
membershipRouter.get(
  "/member/:memberId/summary",
  requirePermission("memberships.read"),
  getMembershipSummary
);

// Complete membership history.
membershipRouter.get(
  "/member/:memberId",
  requirePermission("memberships.read"),
  getMemberMemberships
);
