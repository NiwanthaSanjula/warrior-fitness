import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { requireAuth, requireRole } from "../src/middlewares/auth.middleware.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { testClient } from "./helpers/http.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";

function protectedClient() {
  const app = express();
  app.use(cookieParser());
  app.get("/session", requireAuth, (req, res) => res.json({ staff: req.staff }));
  app.get("/admin", requireAuth, requireRole("ADMIN"), (_req, res) => res.json({ authorized: true }));
  return testClient(app);
}

function signedCookie(options: jwt.SignOptions = {}, secret = env.JWT_SECRET): string {
  const token = jwt.sign({}, secret, {
    algorithm: "HS256", subject: staffFixture().id, expiresIn: "1h",
    issuer: "warrior-fitness", audience: "warrior-fitness-web", ...options,
  });
  return `wf_session=${token}`;
}

const invalidSessions: ReadonlyArray<readonly [string, () => string]> = [
  ["malformed token", () => "wf_session=not-a-jwt"],
  ["expired token", () => signedCookie({ expiresIn: -1 })],
  ["invalid signature", () => signedCookie({}, "different-synthetic-test-only-signing-key")],
  ["incorrect issuer", () => signedCookie({ issuer: "another-test-issuer" })],
  ["incorrect audience", () => signedCookie({ audience: "another-test-audience" })],
  ["unapproved signing algorithm", () => signedCookie({ algorithm: "HS384" })],
  ["missing subject", () => `wf_session=${jwt.sign({}, env.JWT_SECRET, {
    algorithm: "HS256", expiresIn: "1h", issuer: "warrior-fitness", audience: "warrior-fitness-web",
  })}`],
];

const unavailableStaff: ReadonlyArray<readonly [string, () => ReturnType<typeof staffFixture> | null]> = [
  ["inactive", () => staffFixture("ADMIN", { isActive: false })],
  ["deleted/nonexistent", () => null],
];

describe("actual token verification and authentication middleware", () => {
  it("accepts a real signed token for active staff", async () => {
    const staff = staffFixture();
    const lookup = vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const response = await protectedClient().get("/session").set("Cookie", sessionCookie(staff.id));
    expect(response.status).toBe(200);
    expect(response.body.staff.id).toBe(staff.id);
    expect(lookup).toHaveBeenCalledWith(staff.id);
  });

  it("rejects a missing cookie before querying staff", async () => {
    const lookup = vi.spyOn(Staff, "findById");
    const response = await protectedClient().get("/session");
    expect(response.status).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(invalidSessions)("rejects a %s before querying staff", async (_label, cookie) => {
    const lookup = vi.spyOn(Staff, "findById");
    const response = await protectedClient().get("/session").set("Cookie", cookie());
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired session");
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(unavailableStaff)("rejects %s staff even with a valid token", async (_label, fixture) => {
    const staff = staffFixture();
    vi.spyOn(Staff, "findById").mockResolvedValue(fixture());
    const response = await protectedClient().get("/session").set("Cookie", sessionCookie(staff.id));
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Staff account unavailable");
  });

  it("uses the current staff role on every request rather than a role captured at login", async () => {
    const staff = staffFixture();
    const lookup = vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const cookie = sessionCookie(staff.id);
    expect((await protectedClient().get("/admin").set("Cookie", cookie)).status).toBe(200);
    staff.role = "RECEPTIONIST";
    expect((await protectedClient().get("/admin").set("Cookie", cookie)).status).toBe(403);
    staff.role = "ADMIN";
    expect((await protectedClient().get("/admin").set("Cookie", cookie)).status).toBe(200);
    expect(lookup).toHaveBeenCalledTimes(3);
  });
});
