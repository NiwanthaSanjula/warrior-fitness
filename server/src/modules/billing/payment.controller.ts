
import type { RequestHandler } from "express";
import mongoose from "mongoose";
import type { z } from "zod";

import {
  Invoice,
  toPublicInvoice,
} from "./invoice.model.js";

import {
  Payment,
  toPublicPayment,
  type IPayment,
} from "./payment.model.js";

import {
  recordPaymentSchema,
} from "./payment.validation.js";

import type {
  HydratedDocument,
} from "mongoose";

type PaymentInput =
  z.infer<typeof recordPaymentSchema>;

const objectIdPattern = /^[a-fA-F0-9]{24}$/;

class PaymentHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "PaymentHttpError";
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function isSamePaymentRequest(
  payment: HydratedDocument<IPayment>,
  input: PaymentInput
): boolean {
  return (
    payment.invoice.toString().toLowerCase() ===
      input.invoiceId.toLowerCase() &&
    payment.amountLkr === input.amountLkr &&
    payment.method === input.method &&
    payment.reference === (input.reference ?? "") &&
    payment.notes === (input.notes ?? "")
  );
}

// POST /api/payments
export const recordPayment: RequestHandler = async (
  req,
  res
) => {
  const parsed = recordPaymentSchema.safeParse(
    req.body
  );

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Payment validation failed",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
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

  const input = parsed.data;

  const {
    invoiceId,
    amountLkr,
    method,
    requestId,
  } = input;

  try {
    const result = await mongoose.connection.transaction(
      async (session) => {
        // The same request ID must not record
        // money more than once.
        const previousPayment =
          await Payment.findOne({
            requestId,
          }).session(session);

        if (previousPayment) {
          if (
            !isSamePaymentRequest(
              previousPayment,
              input
            )
          ) {
            throw new PaymentHttpError(
              409,
              "This request ID belongs to another payment"
            );
          }

          const existingInvoice =
            await Invoice.findById(
              previousPayment.invoice
            ).session(session);

          if (!existingInvoice) {
            throw new PaymentHttpError(
              409,
              "Previously recorded invoice was not found"
            );
          }

          return {
            payment: previousPayment,
            invoice: existingInvoice,
            replayed: true,
          };
        }

        // Load the invoice inside the transaction.
        const invoice = await Invoice.findById(
          invoiceId
        ).session(session);

        if (!invoice) {
          throw new PaymentHttpError(
            404,
            "Invoice not found"
          );
        }

        const outstanding =
          invoice.totalLkr - invoice.paidLkr;

        if (amountLkr > outstanding) {
          throw new PaymentHttpError(
            409,
            `Payment exceeds the outstanding balance of LKR ${outstanding}`
          );
        }

        // Atomic conditional increment.
        // This guards against accepting an amount
        // that no longer fits the invoice balance.
        const updatedInvoice =
          await Invoice.findOneAndUpdate(
            {
              _id: invoice._id,
              paidLkr: {
                $lte: invoice.totalLkr - amountLkr,
              },
            },
            {
              $inc: {
                paidLkr: amountLkr,
              },
            },
            {
              new: true,
              session,
            }
          );

        if (!updatedInvoice) {
          throw new PaymentHttpError(
            409,
            "Invoice balance changed. Refresh the invoice before recording payment."
          );
        }

        // Generate a unique payment reference.
        const paymentId =
          new mongoose.Types.ObjectId();

        const payment = new Payment({
          _id: paymentId,

          paymentNumber:
            `WF-PAY-${paymentId.toString().toUpperCase()}`,

          requestId,

          invoice: invoice._id,
          member: invoice.member,

          amountLkr,
          method,

          reference: input.reference ?? "",
          notes: input.notes ?? "",

          receivedBy: req.staff!.id,
        });

        // Both writes use the SAME transaction.
        await payment.save({ session });

        return {
          payment,
          invoice: updatedInvoice,
          replayed: false,
        };
      }
    );

    res.status(result.replayed ? 200 : 201).json({
      success: true,
      message: result.replayed
        ? "Payment already recorded"
        : "Payment recorded successfully",
      replayed: result.replayed,

      data: {
        payment: toPublicPayment(result.payment),
        invoice: toPublicInvoice(result.invoice),
      },
    });
  } catch (error: unknown) {
    if (error instanceof PaymentHttpError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    // Handle a concurrent request with the same
    // requestId, protected by the unique index.
    if (isDuplicateKeyError(error)) {
      const completed = await Payment.findOne({
        requestId,
      });

      if (
        completed &&
        isSamePaymentRequest(completed, input)
      ) {
        const invoice = await Invoice.findById(
          completed.invoice
        );

        if (invoice) {
          res.status(200).json({
            success: true,
            message: "Payment already recorded",
            replayed: true,

            data: {
              payment: toPublicPayment(completed),
              invoice: toPublicInvoice(invoice),
            },
          });
          return;
        }
      }

      res.status(409).json({
        success: false,
        message:
          "Payment request conflict. Check invoice history before retrying.",
      });
      return;
    }

    // Let our existing Express error handler
    // process unexpected database errors.
    throw error;
  }
};

// GET /api/payments/invoice/:invoiceId
export const getInvoicePayments: RequestHandler =
  async (req, res) => {
    const invoiceId = req.params.invoiceId as string;

    if (
      !invoiceId ||
      !objectIdPattern.test(invoiceId)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid invoice ID",
      });
      return;
    }

    const invoice = await Invoice.findById(
      invoiceId
    );

    if (!invoice) {
      res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
      return;
    }

    const payments = await Payment.find({
      invoice: invoice._id,
    }).sort({
      receivedAt: -1,
      _id: -1,
    });

    res.status(200).json({
      success: true,

      invoice: toPublicInvoice(invoice),

      data: payments.map(toPublicPayment),
      total: payments.length,
    });
  };
