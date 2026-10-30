
import { z } from "zod";

export const expiringMembershipQuerySchema =
  z.strictObject({
    // Number of calendar dates to examine,
    // including today.
    days: z.coerce.number()
      .int()
      .min(1)
      .max(30)
      .default(7),

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
