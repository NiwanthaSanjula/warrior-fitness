
import { z } from "zod";

// Accept the same phone formats as our backend.
function isValidPhone(value: string): boolean {
  const cleaned = value.replace(/[\s()-]/g, "");

  return /^(?:0\d{9}|\+94\d{9})$/.test(cleaned);
}

const genderSchema = z.enum([
  "MALE",
  "FEMALE",
  "OTHER",
  "PREFER_NOT_TO_SAY",
]);

export const memberRegistrationSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must have at least 2 characters")
      .max(100, "Full name is too long"),

    phone: z
      .string()
      .trim()
      .refine(isValidPhone, {
        message: "Enter a valid Sri Lankan phone number",
      }),

    gender: z.union([
      genderSchema,
      z.literal(""),
    ]),

    dateOfBirth: z
      .string()
      .refine(
        (value) =>
          value === "" ||
          (
            z.iso.date().safeParse(value).success &&
            value <= new Date().toISOString().slice(0, 10)
          ),
        {
          message: "Enter a valid date of birth",
        }
      ),

    address: z
      .string()
      .trim()
      .max(300, "Address is too long"),

    emergencyContactName: z
      .string()
      .trim()
      .max(100, "Contact name is too long"),

    emergencyContactPhone: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    const hasName = data.emergencyContactName.length > 0;
    const hasPhone = data.emergencyContactPhone.length > 0;

    // Emergency contact is optional,
    // but both fields are required together.
    if (hasPhone && !hasName) {
      ctx.addIssue({
        code: "custom",
        path: ["emergencyContactName"],
        message: "Enter the emergency contact name",
      });
    }

    if (hasName && !hasPhone) {
      ctx.addIssue({
        code: "custom",
        path: ["emergencyContactPhone"],
        message: "Enter the emergency contact phone",
      });
    }

    if (hasName && data.emergencyContactName.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["emergencyContactName"],
        message: "Name must have at least 2 characters",
      });
    }

    if (hasPhone && !isValidPhone(data.emergencyContactPhone)) {
      ctx.addIssue({
        code: "custom",
        path: ["emergencyContactPhone"],
        message: "Enter a valid Sri Lankan phone number",
      });
    }
  });

export type MemberRegistrationForm =
  z.infer<typeof memberRegistrationSchema>;
