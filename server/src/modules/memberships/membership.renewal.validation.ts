
import { z } from "zod";

const objectIdSchema = z.string().regex(
  /^[a-fA-F0-9]{24}$/,
  "Invalid MongoDB ObjectId"
);

export const renewMembershipSchema = z.strictObject({
  memberId: objectIdSchema,
  planId: objectIdSchema,

  // Unique identifier for one intended renewal.
  // The frontend will generate this in Step 3.
  requestId: z.uuid(),
});
