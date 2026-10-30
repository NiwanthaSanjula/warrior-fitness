
import { z } from "zod";

export const followUpFormSchema = z
  .object({
    method: z.enum([
      "PHONE_CALL",
      "WHATSAPP",
      "SMS",
      "EMAIL",
      "IN_PERSON",
      "INTERNAL_REVIEW",
    ]),

    outcome: z.enum([
      "CONTACTED",
      "NO_ANSWER",
      "PROMISED_ACTION",
      "FOLLOW_UP_REQUIRED",
      "DECLINED",
      "RESOLVED",
    ]),

    notes: z.string()
      .trim()
      .min(3, "Enter at least 3 characters")
      .max(500, "Maximum 500 characters"),

    nextFollowUpDate: z.union([
      z.literal(""),
      z.iso.date(),
    ]),
  })
  .superRefine((values, ctx) => {
    const needsDate =
      values.outcome === "FOLLOW_UP_REQUIRED" ||
      values.outcome === "PROMISED_ACTION";

    if (
      needsDate &&
      !values.nextFollowUpDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["nextFollowUpDate"],
        message: "Select a next follow-up date",
      });
    }

    if (
      values.outcome === "RESOLVED" &&
      values.nextFollowUpDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["nextFollowUpDate"],
        message:
          "Clear the date when marking this resolved",
      });
    }
  });

export type FollowUpFormValues =
  z.infer<typeof followUpFormSchema>;
