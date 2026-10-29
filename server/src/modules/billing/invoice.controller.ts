
import type { RequestHandler } from "express";

import { Member } from "../members/member.model.js";

import {
  Membership,
} from "../memberships/membership.model.js";

import {
  todayInColombo,
} from "../memberships/membership.dates.js";

import {
  Invoice,
  toPublicInvoice,
} from "./invoice.model.js";

import {
  createInvoiceSchema,
} from "./invoice.validation.js";

const objectIdPattern = /^[a-fA-F0-9]{24}$/;

function isDuplicateKeyError(
  error: unknown
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

// POST /api/invoices
export const createInvoice: RequestHandler =
  async (req, res) => {
    const parsed = createInvoiceSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invoice validation failed",
        errors: parsed.error.issues.map(
          (issue) => ({
            field: issue.path.join(".") || "body",
            message: issue.message,
          })
        ),
      });
      return;
    }

    if (!req.staff) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const { membershipId } = parsed.data;

    // First check if an invoice already exists.
    const existing = await Invoice.findOne({
      membership: membershipId,
    });

    if (existing) {
      res.status(200).json({
        success: true,
        message: "Invoice already exists",
        replayed: true,
        data: toPublicInvoice(existing),
      });
      return;
    }

    // Retrieve the actual purchased membership.
    const membership = await Membership.findById(
      membershipId
    );

    if (!membership) {
      res.status(404).json({
        success: false,
        message: "Membership not found",
      });
      return;
    }

    // Use purchased terms, not today's plan price.
    const totalLkr =
      membership.planSnapshot.priceLkr;

    const invoiceNumber =
      `WF-INV-${membership._id.toString().toUpperCase()}`;

    const today = todayInColombo();

    try {
      const invoice = await Invoice.create({
        invoiceNumber,

        member: membership.member,
        membership: membership._id,

        planCode: membership.planSnapshot.code,
        planName: membership.planSnapshot.name,

        totalLkr,
        paidLkr: 0,

        // MVP: payment due on invoice issue date.
        dueDate: today,

        createdBy: req.staff.id,
      });

      res.status(201).json({
        success: true,
        message: "Invoice created successfully",
        replayed: false,
        data: toPublicInvoice(invoice, today),
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      // Another request may have created the
      // invoice while this request was running.
      const completed = await Invoice.findOne({
        membership: membership._id,
      });

      if (completed) {
        res.status(200).json({
          success: true,
          message: "Invoice already exists",
          replayed: true,
          data: toPublicInvoice(completed, today),
        });
        return;
      }

      throw error;
    }
  };

// GET /api/invoices/:id
export const getInvoiceById: RequestHandler =
  async (req, res) => {
    const id = req.params.id as string;

    if (!id || !objectIdPattern.test(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid invoice ID",
      });
      return;
    }

    const invoice = await Invoice.findById(id);

    if (!invoice) {
      res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: toPublicInvoice(invoice),
    });
  };

// GET /api/invoices/member/:memberId
export const getMemberInvoices: RequestHandler =
  async (req, res) => {
    const memberId = req.params.memberId as string;

    if (!memberId || !objectIdPattern.test(memberId)) {
      res.status(400).json({
        success: false,
        message: "Invalid member ID",
      });
      return;
    }

    const memberExists = await Member.exists({
      _id: memberId,
    });

    if (!memberExists) {
      res.status(404).json({
        success: false,
        message: "Member not found",
      });
      return;
    }

    const invoices = await Invoice.find({
      member: memberId,
    }).sort({
      createdAt: -1,
      _id: -1,
    });

    res.status(200).json({
      success: true,
      data: invoices.map((invoice) =>
        toPublicInvoice(invoice)
      ),
      total: invoices.length,
    });
  };
