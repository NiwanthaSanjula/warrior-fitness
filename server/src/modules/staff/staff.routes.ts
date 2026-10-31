
import { Router } from "express";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";

import {
  Staff,
  toPublicStaff,
} from "../auth/staff.model.js";

export const staffRouter = Router();

const createStaffSchema = z.object({
  fullName: z.string().trim().min(2).max(100),

  email: z.email().trim().toLowerCase(),

  password: z
    .string()
    .min(12)
    .refine(
      (password) =>
        Buffer.byteLength(password, "utf8") <= 72,
      "Password is too long"
    ),
});

// Middleware - Only admins can access staff management
staffRouter.use(requireAuth, requireRole("ADMIN"), requirePermission("staff.manage"));

// GET /api/staff
staffRouter.get("/", async (_req, res) => {
  const staffMembers = await Staff.find().sort({
    createdAt: -1,
  });

  res.status(200).json({
    success: true,
    data: staffMembers.map(toPublicStaff),
  });
});

// POST /api/staff
staffRouter.post("/", async (req, res) => {
  const parsed = createStaffSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid staff details",
      errors: parsed.error.issues.map(
        (issue) => issue.message
      ),
    });
    return;
  }

  const { fullName, email, password } = parsed.data;

  const existingStaff = await Staff.findOne({
    email,
  });

  if (existingStaff) {
    res.status(409).json({
      success: false,
      message: "A staff account with this email already exists",
    });
    return;
  }

  const passwordHash = await bcrypt.hash(
    password,
    12
  );

  const newStaff = await Staff.create({
    fullName,
    email,
    passwordHash,
    role: "RECEPTIONIST",
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: "Receptionist account created",
    staff: toPublicStaff(newStaff),
  });
});
