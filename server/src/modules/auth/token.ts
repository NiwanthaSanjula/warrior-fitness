
import jwt from "jsonwebtoken";

import { env } from "../../config/env.js";

const TOKEN_DURATION = "8h";
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export const AUTH_COOKIE_NAME = "wf_session";

export const authCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api",
};

export function createAuthToken(
  staffId: string,
  sessionVersion: number
): string {
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) throw new Error("Invalid session version");
  return jwt.sign(
    { sessionVersion },
    env.JWT_SECRET,
    {
      algorithm: "HS256",
      subject: staffId,
      expiresIn: TOKEN_DURATION,
      issuer: "warrior-fitness",
      audience: "warrior-fitness-web",
    }
  );
}

export function verifyAuthToken(
  token: string
): { staffId: string; sessionVersion: number } {
  const payload = jwt.verify(
    token,
    env.JWT_SECRET,
    {
      algorithms: ["HS256"],
      issuer: "warrior-fitness",
      audience: "warrior-fitness-web",
    }
  );

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    !/^[a-f\d]{24}$/i.test(payload.sub) ||
    !Number.isSafeInteger(payload.sessionVersion) ||
    payload.sessionVersion < 0
  ) {
    throw new Error("Invalid authentication token");
  }

  return { staffId: payload.sub, sessionVersion: payload.sessionVersion as number };
}

export function getAuthCookieMaxAge(): number {
  return EIGHT_HOURS_MS;
}
