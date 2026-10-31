
import { Router } from "express";
import { requirePermission } from "../../middlewares/permission.middleware.js";

import {
  requireAuth,
  requireRole,
} from "../../middlewares/auth.middleware.js";

import {
  checkInMember,
} from "./attendance.controller.js";

import {
  getDailyAttendance,
  getAttendanceSummary,
  getMemberAttendance,
} from "./attendance.reporting.controller.js";

import {
  searchAttendanceMembers,
} from "./attendance.search.controller.js";

export const attendanceRouter = Router();

attendanceRouter.use(
  requireAuth,
  requireRole("ADMIN", "RECEPTIONIST")
);

// Record member attendance.
attendanceRouter.post(
  "/check-in",
  requirePermission("attendance.check-in"),
  checkInMember
);

// Daily attendance statistics.
attendanceRouter.get(
  "/summary",
  requirePermission("attendance.read"),
  getAttendanceSummary
);

// Attendance history for one member.
attendanceRouter.get(
  "/member/:memberId",
  requirePermission("attendance.read"),
  getMemberAttendance
);

// Daily check-in directory.
attendanceRouter.get(
  "/",
  requirePermission("attendance.read"),
  getDailyAttendance
);

attendanceRouter.get(
  "/member-search",
  requirePermission("attendance.read"),
  searchAttendanceMembers
);
