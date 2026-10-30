
import { Router } from "express";

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
  recordPayment
);

// Read payment history for an invoice.
paymentRouter.get(
  "/invoice/:invoiceId",
  getInvoicePayments
);
