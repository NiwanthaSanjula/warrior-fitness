
import type { RequestHandler } from "express";

import {
  Staff,
  type StaffRole,
} from "../modules/auth/staff.model.js";

import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  verifyAuthToken,
} from "../modules/auth/token.js";
import { effectivePermissions } from "../modules/auth/permissions.js";

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

  let session: ReturnType<typeof verifyAuthToken>;

  try {
    session = verifyAuthToken(token);
  } catch {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
    res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
    return;
  }

  const staff = await Staff.findById(session.staffId);

  if (!staff || !staff.isActive) {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
    res.status(401).json({
      success: false,
      message: "Staff account unavailable",
    });
    return;
  }

  if (session.sessionVersion !== (staff.sessionVersion ?? 0)) {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
    res.status(401).json({ success: false, message: "Session revoked. Please sign in again." });
    return;
  }

  req.staff = {
    id: staff.id,
    fullName: staff.fullName,
    email: staff.email,
    role: staff.role,
    permissions: effectivePermissions(staff),
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
