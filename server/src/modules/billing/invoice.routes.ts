
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  createInvoice,
  getInvoiceById,
  getMemberInvoices,
} from "./invoice.controller.js";

import {
  getAllInvoices,
  getBillingOverview,
} from "./invoice.list.controller.js";

export const invoiceRouter = Router();

// Only authenticated gym staff.
invoiceRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

// Create an invoice from a purchased membership.
invoiceRouter.post("/", createInvoice);

invoiceRouter.get("/", getAllInvoices);

invoiceRouter.get(
  "/overview",
  getBillingOverview
);

// Member invoice history.
// Keep this route before /:id.
invoiceRouter.get(
  "/member/:memberId",
  getMemberInvoices
);

// Retrieve one invoice.
invoiceRouter.get("/:id", getInvoiceById);
