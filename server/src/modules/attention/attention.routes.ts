
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  getExpiringMemberships,
} from "./attention.controller.js";

import {
  getOutstandingPayments,
} from "./attention.billing.controller.js";

import {
  getAttendanceInactivityAlerts,
} from "./attention.inactivity.controller.js";


export const attentionRouter = Router();

attentionRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

// Membership expiry alerts.
attentionRouter.get(
  "/expiring",
  getExpiringMemberships
);

// Outstanding payment alerts.
attentionRouter.get(
  "/outstanding",
  getOutstandingPayments
);

attentionRouter.get(
  "/inactive-attendance",
  getAttendanceInactivityAlerts
);

