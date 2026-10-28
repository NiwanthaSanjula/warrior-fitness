
import { z } from "zod";

import {
  createMemberSchema,
} from "./member.validation.js";

// Query parameters for member listing
export const memberListQuerySchema = z.strictObject({
  q: z.string().trim().max(100).default(""),

  page: z.coerce.number()
    .int()
    .min(1)
    .default(1),

  limit: z.coerce.number()
    .int()
    .min(1)
    .max(50)
    .default(10),

  status: z.enum([
    "all",
    "active",
    "inactive",
  ]).default("all"),
});

// Update only fields that staff are allowed to edit.
// null can clear optional profile information.
export const updateMemberSchema = z.strictObject({
  fullName:
    createMemberSchema.shape.fullName.optional(),

  phone:
    createMemberSchema.shape.phone.optional(),

  gender:
    createMemberSchema.shape.gender.nullable(),

  dateOfBirth:
    createMemberSchema.shape.dateOfBirth.nullable(),

  address:
    createMemberSchema.shape.address.nullable(),

  emergencyContact:
    createMemberSchema.shape.emergencyContact.nullable(),
}).refine(
  (data) => Object.keys(data).length > 0,
  {
    message: "Provide at least one field to update",
  }
);
