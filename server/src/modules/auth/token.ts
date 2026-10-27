
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
  staffId: string
): string {
  return jwt.sign(
    {},
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
): string {
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
    typeof payload.sub !== "string"
  ) {
    throw new Error("Invalid authentication token");
  }

  return payload.sub;
}

export function getAuthCookieMaxAge(): number {
  return EIGHT_HOURS_MS;
}
