
import { z } from "zod";

export const outstandingPaymentsQuerySchema =
  z.strictObject({
    status: z
      .enum(["all", "overdue"])
      .default("all"),

    search: z
      .string()
      .trim()
      .max(80)
      .default(""),

    page: z.coerce.number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce.number()
      .int()
      .min(1)
      .max(50)
      .default(10),
  });
