
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  getExpiringMemberships,
} from "./attention.controller.js";

export const attentionRouter = Router();

attentionRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

attentionRouter.get(
  "/expiring",
  getExpiringMemberships
);
