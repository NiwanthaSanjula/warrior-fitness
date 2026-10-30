
import { z } from "zod";

import {
  PAYMENT_METHODS,
} from "./payment.model.js";

export const recordPaymentSchema = z
  .strictObject({
    invoiceId: z.string().regex(
      /^[a-fA-F0-9]{24}$/,
      "Invalid invoice ID"
    ),

    amountLkr: z
      .number()
      .int("Payment amount must be a whole number")
      .min(1, "Payment amount must be positive")
      .max(10000000),

    method: z.enum(PAYMENT_METHODS),

    // One UUID for each intended payment.
    requestId: z.uuid(),

    reference: z
      .string()
      .trim()
      .max(80)
      .optional(),

    notes: z
      .string()
      .trim()
      .max(300)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.method !== "CASH" &&
      !data.reference
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message:
          "A transaction reference is required for bank transfers and card payments",
      });
    }
  });
