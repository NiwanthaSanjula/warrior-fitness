
import { Router } from "express";
import { requirePermission } from "../../middlewares/permission.middleware.js";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  recordPayment,
  getInvoicePayments,
} from "./payment.controller.js";

export const paymentRouter = Router();

// Admin and Receptionist only.
paymentRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

// Record a payment against an invoice.
paymentRouter.post(
  "/",
  requirePermission("payments.record"),
  recordPayment
);

// Read payment history for an invoice.
paymentRouter.get(
  "/invoice/:invoiceId",
  requirePermission("payments.read"),
  getInvoicePayments
);
