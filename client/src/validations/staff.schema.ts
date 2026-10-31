import { z } from "zod";

export const staffProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Name needs at least 2 characters").max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address")),
});
const password = z.string().min(12, "Use at least 12 characters").refine((value) => new TextEncoder().encode(value).length <= 72, "Password must not exceed 72 UTF-8 bytes");
export const staffPasswordSchema = z.object({ password, confirmPassword: z.string() }).refine((value) => value.password === value.confirmPassword, "Passwords must match");
export const createStaffFormSchema = staffProfileSchema.extend({ password, confirmPassword: z.string() }).refine((value) => value.password === value.confirmPassword, "Passwords must match");
