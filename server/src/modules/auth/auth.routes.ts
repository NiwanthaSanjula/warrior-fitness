
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

  if (!staff || !staff.isActive) {
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
  if (session) await revokeStaffSessions(session.staffId, session.sessionVersion);
  res.clearCookie(
    AUTH_COOKIE_NAME,
    authCookieOptions
  );

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});
