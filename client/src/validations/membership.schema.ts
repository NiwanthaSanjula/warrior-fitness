
import { z } from "zod";

export const membershipFormSchema = z.object({
  planId: z
    .string()
    .min(1, "Please select a membership plan"),

  startDate: z
    .string()
    .refine(
      (value) =>
        !value || z.iso.date().safeParse(value).success,
      "Enter a valid start date"
    ),
});

export type MembershipFormValues =
  z.infer<typeof membershipFormSchema>;
