
import { z } from "zod";

import { createPlanSchema } from "./plan.validation.js";

// Only fields an admin may edit.
export const updatePlanSchema = z
  .strictObject({
    name: createPlanSchema.shape.name.optional(),

    description:
      createPlanSchema.shape.description.optional(),

    durationUnit:
      createPlanSchema.shape.durationUnit.optional(),

    durationCount:
      createPlanSchema.shape.durationCount.optional(),

    priceLkr:
      createPlanSchema.shape.priceLkr.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: "Provide at least one field to update",
    }
  );

// Activation/deactivation request.
export const updatePlanStatusSchema = z.strictObject({
  isActive: z.boolean(),
});
