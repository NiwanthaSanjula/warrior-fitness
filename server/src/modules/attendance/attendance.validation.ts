
import { z } from "zod";

export const checkInSchema = z.strictObject({
  memberId: z.string().regex(
    /^[a-fA-F0-9]{24}$/,
    "Invalid member ID"
  ),
});
