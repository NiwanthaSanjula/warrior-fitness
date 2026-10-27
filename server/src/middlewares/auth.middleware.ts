
import type { RequestHandler } from "express";

import {
  Staff,
  type StaffRole,
} from "../modules/auth/staff.model.js";

import {
  AUTH_COOKIE_NAME,
  verifyAuthToken,
} from "../modules/auth/token.js";

export const requireAuth: RequestHandler = async (
  req,
  res,
  next
) => {
  const token: unknown = req.cookies?.[AUTH_COOKIE_NAME];

  if (typeof token !== "string") {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  let staffId: string;

  try {
    staffId = verifyAuthToken(token);
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
    return;
  }

  const staff = await Staff.findById(staffId);

  if (!staff || !staff.isActive) {
    res.status(401).json({
      success: false,
      message: "Staff account unavailable",
    });
    return;
  }

  req.staff = {
    id: staff.id,
    fullName: staff.fullName,
    email: staff.email,
    role: staff.role,
  };

  next();
};

export function requireRole(
  ...allowedRoles: StaffRole[]
): RequestHandler {
  return (req, res, next) => {
    if (!req.staff) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!allowedRoles.includes(req.staff.role)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission",
      });
      return;
    }

    next();
  };
}
