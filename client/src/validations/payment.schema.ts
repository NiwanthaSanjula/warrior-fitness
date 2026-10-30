
import { z } from "zod";

export const paymentFormSchema = z
  .object({
    amountLkr: z
      .number({
        error: "Enter a valid payment amount",
      })
      .int("Amount must be a whole number")
      .min(1, "Amount must be greater than zero")
      .max(10000000, "Amount is too large"),

    method: z.enum([
      "CASH",
      "BANK_TRANSFER",
      "CARD",
    ]),

    reference: z.string().trim().max(80),
    notes: z.string().trim().max(300),
  })
  .superRefine((values, ctx) => {
    if (
      values.method !== "CASH" &&
      !values.reference
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message:
          "Transaction reference is required for bank transfers and card payments",
      });
    }
  });

export type PaymentFormValues =
  z.infer<typeof paymentFormSchema>;
