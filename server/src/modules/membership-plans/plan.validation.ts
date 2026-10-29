
import { z } from "zod";

import {
  DURATION_UNITS,
} from "./plan.model.js";

// Validates creation of a membership plan.
export const createPlanSchema = z
  .strictObject({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z][A-Z0-9_-]{2,19}$/,
        "Code must contain 3–20 characters, start with a letter, and use only letters, numbers, hyphens or underscores"
      ),

    name: z
      .string()
      .trim()
      .min(3, "Plan name must have at least 3 characters")
      .max(80),

    description: z
      .string()
      .trim()
      .max(500)
      .default(""),

    durationUnit: z.enum(DURATION_UNITS),

    durationCount: z
      .number()
      .int()
      .min(1)
      .max(365),

    priceLkr: z
      .number()
      .int()
      .min(1, "Price must be greater than zero")
      .max(10000000),
  })
  .superRefine((data, ctx) => {
    if (
      data.durationUnit === "MONTHS" &&
      data.durationCount > 36
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["durationCount"],
        message:
          "A plan cannot exceed 36 calendar months",
      });
    }
  });

// Validates GET /api/plans query parameters.
export const planListQuerySchema = z.strictObject({
  status: z
    .enum(["active", "inactive", "all"])
    .default("active"),
});

export type CreatePlanInput =
  z.infer<typeof createPlanSchema>;
