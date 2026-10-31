
import { Router } from "express";
import { requirePermission } from "../../middlewares/permission.middleware.js";

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
invoiceRouter.post("/", requirePermission("invoices.create"), createInvoice);

invoiceRouter.get("/", requirePermission("invoices.read"), getAllInvoices);

invoiceRouter.get(
  "/overview",
  requirePermission("invoices.read"),
  getBillingOverview
);

// Member invoice history.
// Keep this route before /:id.
invoiceRouter.get(
  "/member/:memberId",
  requirePermission("invoices.read"),
  getMemberInvoices
);

// Retrieve one invoice.
invoiceRouter.get("/:id", requirePermission("invoices.read"), getInvoiceById);
