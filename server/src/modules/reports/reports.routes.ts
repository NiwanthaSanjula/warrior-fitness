
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  getRevenueCollections,
} from "./reports.controller.js";

import {
  getInvoiceIssuanceReport,
  getReceivablesReport,
} from "./reports.invoice.controller.js";

import {
  getMembershipActivity,
  getActiveMembershipSnapshot,
} from "./reports.membership.controller.js";

import {
  getAttendanceTrends,
} from "./reports.attendance.controller.js";

export const reportsRouter = Router();

// Reports & Analytics: Admin-only.
reportsRouter.use(
  requireAuth,
  requireRole("ADMIN")
);

// Financial reports
reportsRouter.get(
  "/revenue/collections",
  getRevenueCollections
);

reportsRouter.get(
  "/revenue/invoices",
  getInvoiceIssuanceReport
);

reportsRouter.get(
  "/revenue/receivables",
  getReceivablesReport
);

// Membership analytics
reportsRouter.get(
  "/memberships/activity",
  getMembershipActivity
);

reportsRouter.get(
  "/memberships/active",
  getActiveMembershipSnapshot
);

// Attendance analytics
reportsRouter.get(
  "/attendance/trends",
  getAttendanceTrends
);
