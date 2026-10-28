
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  createMember,
} from "./member.controller.js";

export const memberRouter = Router();

// All member routes require an authorized staff account.
memberRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

// Register a new gym member.
memberRouter.post("/", createMember);
