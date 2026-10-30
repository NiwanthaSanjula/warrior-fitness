
import { Router } from "express";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  checkInMember,
} from "./attendance.controller.js";

export const attendanceRouter = Router();

attendanceRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

attendanceRouter.post(
  "/check-in",
  checkInMember
);
