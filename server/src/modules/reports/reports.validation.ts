
import { z } from "zod";

export const collectionsQuerySchema = z.strictObject({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
