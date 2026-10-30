
import { z } from "zod";

import {
  FOLLOW_UP_METHODS,
  FOLLOW_UP_OUTCOMES,
  FOLLOW_UP_TYPES,
} from "./follow-up.model.js";

const objectIdSchema = z
  .string()
  .regex(
    /^[a-fA-F0-9]{24}$/,
    "Invalid member ID"
  );

export const createFollowUpSchema = z
  .strictObject({
    requestId: z.uuid(),

    memberId: objectIdSchema,

    alertType: z.enum(FOLLOW_UP_TYPES),

    method: z.enum(FOLLOW_UP_METHODS),

    outcome: z.enum(FOLLOW_UP_OUTCOMES),

    notes: z
      .string()
      .trim()
      .min(3, "Enter meaningful follow-up notes")
      .max(500),

    nextFollowUpDate: z.iso
      .date()
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      (
        data.outcome === "FOLLOW_UP_REQUIRED" ||
        data.outcome === "PROMISED_ACTION"
      ) &&
      !data.nextFollowUpDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["nextFollowUpDate"],
        message:
          "A next follow-up date is required for this outcome",
      });
    }

    if (
      data.outcome === "RESOLVED" &&
      data.nextFollowUpDate
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["nextFollowUpDate"],
        message:
          "A resolved follow-up cannot have another scheduled date",
      });
    }
  });

export const memberFollowUpQuerySchema =
  z.strictObject({
    alertType: z
      .enum(["all", ...FOLLOW_UP_TYPES])
      .default("all"),

    page: z.coerce.number()
      .int().min(1).default(1),

    limit: z.coerce.number()
      .int().min(1).max(50).default(10),
  });

export const dueFollowUpQuerySchema =
  z.strictObject({
    page: z.coerce.number()
      .int().min(1).default(1),

    limit: z.coerce.number()
      .int().min(1).max(50).default(10),
  });

export type CreateFollowUpInput =
  z.infer<typeof createFollowUpSchema>;
