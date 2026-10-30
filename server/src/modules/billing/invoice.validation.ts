
import { z } from "zod";

export const createInvoiceSchema = z.strictObject({
  membershipId: z
    .string()
    .regex(
      /^[a-fA-F0-9]{24}$/,
      "Invalid membership ID"
    ),
});
