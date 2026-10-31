
import { Router } from "express";
import { requirePermission } from "../../middlewares/permission.middleware.js";

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
memberRouter.get("/", requirePermission("members.read"), getMembers);

// Register a new gym member.
memberRouter.post("/", requirePermission("members.create"), createMember);

// Member status changes (admin only)
memberRouter.patch(
  "/:id/status",
  requireRole("ADMIN"),
  requirePermission("members.status"),
  updateMemberStatus
)

// Individual member profile
memberRouter.get("/:id", requirePermission("members.read"), getMemberById);

// Update member profile
memberRouter.patch("/:id", requirePermission("members.update"), updateMember);
