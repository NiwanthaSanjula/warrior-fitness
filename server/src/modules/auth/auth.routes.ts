
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";

import {
  Staff,
  toPublicStaff,
} from "./staff.model.js";

import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  createAuthToken,
  getAuthCookieMaxAge,
  verifyAuthToken,
} from "./token.js";
import { revokeStaffSessions } from "./staff-security.service.js";

import { requireAuth } from "../../middlewares/auth.middleware.js";
import { env } from "../../config/env.js";
import { startDemoSession } from "./demo-login.service.js";
import { publicDemoAvailable, DEMO_VIEWER_ID } from "./demo-access.js";
import { DemoSession, demoSessionDigest } from "./demo-session.model.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

// Limit repeated login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many login attempts. Try again later.",
  },
});

// POST /api/auth/login
authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid login details",
    });
    return;
  }

  const { email, password } = parsed.data;

  const staff = await Staff.findOne({
    email,
  }).select("+passwordHash");

  if (!staff || !staff.isActive || staff.isDemoViewer === true) {
    res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
    return;
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    staff.passwordHash
  );

  if (!isPasswordValid) {
    res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
    return;
  }

  const token = createAuthToken(staff.id, staff.sessionVersion ?? 0);

  res.cookie(AUTH_COOKIE_NAME, token, {
    ...authCookieOptions,
    maxAge: getAuthCookieMaxAge(),
  });

  res.status(200).json({
    success: true,
    message: "Login successful",
    staff: toPublicStaff(staff),
  });
});

const demoLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 15,
  standardHeaders: "draft-7", legacyHeaders: false,
  message: { success: false, message: "Too many demo sign-ins. Please try again later." },
});

authRouter.post("/demo-login", demoLoginLimiter, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.get("Origin") !== env.CLIENT_URL) {
    res.status(403).json({ success: false, message: "Request origin is not permitted." });
    return;
  }
  // No input fields can choose an identity, permissions, mode or database.
  const { viewer, sessionId } = await startDemoSession();
  res.cookie(AUTH_COOKIE_NAME, createAuthToken(viewer.id, viewer.sessionVersion ?? 0, sessionId), {
    ...authCookieOptions, maxAge: getAuthCookieMaxAge(),
  });
  res.status(200).json({ success: true, message: "Demo Mode — Read Only", staff: toPublicStaff(viewer) });
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, (req, res) => {
  res.status(200).json({
    success: true,
    staff: req.staff,
  });
});

// POST /api/auth/logout
authRouter.post("/logout", async (req, res) => {
  const token: unknown = req.cookies?.[AUTH_COOKIE_NAME];
  let session: ReturnType<typeof verifyAuthToken> | undefined;
  if (typeof token === "string") {
    try { session = verifyAuthToken(token); } catch { /* Clearing an unavailable session remains idempotent. */ }
  }
  if (session?.demoSessionId) {
    if (publicDemoAvailable() && session.staffId === DEMO_VIEWER_ID) {
      await DemoSession.deleteOne({ _id: demoSessionDigest(session.demoSessionId), staff: session.staffId });
    }
  } else if (session) await revokeStaffSessions(session.staffId, session.sessionVersion);
  res.clearCookie(
    AUTH_COOKIE_NAME,
    authCookieOptions
  );

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});
