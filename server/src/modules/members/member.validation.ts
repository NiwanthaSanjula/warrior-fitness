
import { z } from "zod";

import {
  MEMBER_GENDERS,
} from "./member.model.js";

// Normalize Sri Lankan phone numbers.
const phoneSchema = z
  .string()
  .trim()
  .transform((value) =>
    value.replace(/[\s()-]/g, "")
  )
  .refine(
    (value) => /^(?:0\d{9}|\+94\d{9})$/.test(value),
    {
      message:
        "Enter a valid phone number such as 0771234567 or +94771234567",
    }
  )
  .transform((value) =>
    value.startsWith("0")
      ? `+94${value.slice(1)}`
      : value
  );

export const createMemberSchema = z.strictObject({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must contain at least 2 characters")
    .max(100),

  phone: phoneSchema,

  gender: z.enum(MEMBER_GENDERS).optional(),

  dateOfBirth: z
    .iso.date()
    .refine(
      (date) =>
        date <= new Date().toISOString().slice(0, 10),
      "Date of birth cannot be in the future"
    )
    .optional(),

  address: z
    .string()
    .trim()
    .max(300)
    .optional(),

  emergencyContact: z
    .strictObject({
      name: z.string().trim().min(2).max(100),
      phone: phoneSchema,
    })
    .optional(),
});

export type CreateMemberInput =
  z.infer<typeof createMemberSchema>;
