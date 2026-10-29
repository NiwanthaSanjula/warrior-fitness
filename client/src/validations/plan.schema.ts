
import { z } from "zod";

export const planFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z][A-Z0-9_-]{2,19}$/,
        "Code must have 3–20 characters, start with a letter, and contain only letters, numbers, hyphens or underscores"
      ),

    name: z
      .string()
      .trim()
      .min(3, "Plan name must contain at least 3 characters")
      .max(80, "Plan name is too long"),

    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters"),

    durationUnit: z.enum(["DAYS", "MONTHS"]),

    durationCount: z
      .number({
        error: "Enter a valid duration",
      })
      .int("Duration must be a whole number")
      .min(1, "Duration must be at least 1")
      .max(365, "Duration cannot exceed 365"),

    priceLkr: z
      .number({
        error: "Enter a valid price",
      })
      .int("Price must be a whole number")
      .min(1, "Price must be greater than zero")
      .max(10000000, "Price is too high"),
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
          "Calendar-month plans cannot exceed 36 months",
      });
    }
  });

export type PlanFormValues =
  z.infer<typeof planFormSchema>;
