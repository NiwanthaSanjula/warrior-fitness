
import { Router } from "express";

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
  checkInMember
);

// Daily attendance statistics.
attendanceRouter.get(
  "/summary",
  getAttendanceSummary
);

// Attendance history for one member.
attendanceRouter.get(
  "/member/:memberId",
  getMemberAttendance
);

// Daily check-in directory.
attendanceRouter.get(
  "/",
  getDailyAttendance
);

attendanceRouter.get(
  "/member-search",
  searchAttendanceMembers
);