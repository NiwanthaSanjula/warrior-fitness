
import { z } from "zod";

export const attendanceInactivityQuerySchema =
  z.strictObject({
    days: z.coerce.number()
      .int()
      .min(1)
      .max(90)
      .default(14),

    search: z.string()
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
