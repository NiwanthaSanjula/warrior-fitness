
import { z } from "zod";

const objectIdSchema = z.string().regex(
  /^[a-fA-F0-9]{24}$/,
  "Invalid MongoDB ObjectId"
);

export const createEnrollmentSchema = z.strictObject({
  memberId: objectIdSchema,

  planId: objectIdSchema,

  // Omit this field to start today.
  startDate: z.iso.date().optional(),
});
