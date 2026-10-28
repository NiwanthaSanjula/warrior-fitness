
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  createMember,
} from "./member.controller.js";

import {
  getMembers,
  getMemberById,
  updateMember,
  updateMemberStatus,
} from "./member.management.controller.js";

export const memberRouter = Router();

// All member routes require an authorized staff account.
memberRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

// Member listing and search
memberRouter.get("/", getMembers);

// Register a new gym member.
memberRouter.post("/", createMember);

// Member status changes (admin only)
memberRouter.patch(
  "/:id/status",
  requireRole("ADMIN"),
  updateMemberStatus
)

// Individual member profile
memberRouter.get("/:id", getMemberById);

// Update member profile
memberRouter.patch("/:id", updateMember);
