
import { z } from "zod";

// GET /api/attendance
export const dailyAttendanceQuerySchema = z.strictObject({
  date: z.iso.date().optional(),

  search: z.string().trim().max(80).default(""),

  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number()
    .int().min(1).max(50).default(10),
});

// GET /api/attendance/summary
export const attendanceSummaryQuerySchema = z.strictObject({
  date: z.iso.date().optional(),
});

// GET /api/attendance/member/:memberId
export const memberAttendanceQuerySchema = z
  .strictObject({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),

    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number()
      .int().min(1).max(50).default(10),
  })
  .refine(
    (values) =>
      !values.from ||
      !values.to ||
      values.from <= values.to,
    {
      path: ["to"],
      message: "End date must be on or after start date",
    }
  );
