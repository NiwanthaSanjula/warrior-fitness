
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
import { publicDemoAvailable, demoReadPermitted, DEMO_VIEWER_ID } from "../modules/auth/demo-access.js";
import { DemoSession, demoSessionDigest } from "../modules/auth/demo-session.model.js";

export const requireAuth: RequestHandler = async (
  req,
  res,
  next
) => {
  res.set("Cache-Control", "no-store");
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

  if (session.demoSessionId && (!publicDemoAvailable() || session.staffId !== DEMO_VIEWER_ID)) {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
    res.status(401).json({ success: false, message: "Demo session is unavailable. Please sign in again." });
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

  if ((staff.isDemoViewer === true) !== Boolean(session.demoSessionId)) {
    res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
    res.status(401).json({ success: false, message: "Invalid session identity" });
    return;
  }
  if (staff.isDemoViewer === true) {
    if (!publicDemoAvailable() || staff.id !== DEMO_VIEWER_ID || !session.demoSessionId ||
      !await DemoSession.exists({ _id: demoSessionDigest(session.demoSessionId), staff: staff._id, expiresAt: { $gt: new Date() } })) {
      res.clearCookie(AUTH_COOKIE_NAME, authCookieOptions);
      res.status(401).json({ success: false, message: "Demo session expired or signed out. Try Demo again." });
      return;
    }
    if (!demoReadPermitted(req.method, req.originalUrl.split("?")[0]!)) {
      res.status(403).json({ success: false, message: "Demo Mode — Read Only. Changes are disabled." });
      return;
    }
  }

  req.staff = {
    id: staff.id,
    fullName: staff.fullName,
    email: staff.email,
    role: staff.role,
    permissions: effectivePermissions(staff),
    ...(staff.isDemoViewer === true ? { readOnly: true as const } : {}),
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
