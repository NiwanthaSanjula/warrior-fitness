
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

export const reportsRouter = Router();

// All financial reports are Admin-only.
reportsRouter.use(
  requireAuth,
  requireRole("ADMIN")
);

// Actual payments received.
reportsRouter.get(
  "/revenue/collections",
  getRevenueCollections
);

// Invoices issued during a period.
reportsRouter.get(
  "/revenue/invoices",
  getInvoiceIssuanceReport
);

// Outstanding balances as of now.
reportsRouter.get(
  "/revenue/receivables",
  getReceivablesReport
);
