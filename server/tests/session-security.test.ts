import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { authRouter } from "../src/modules/auth/auth.routes.js";
import { requireAuth } from "../src/middlewares/auth.middleware.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { updateStaffSecurity } from "../src/modules/auth/staff-security.service.js";
import type { StaffSecurityChange } from "../src/modules/auth/staff-security.service.js";
import { createAuthToken, verifyAuthToken } from "../src/modules/auth/token.js";
import { testClient } from "./helpers/http.js";
import { mockLoginLookup, sessionCookie, staffFixture } from "./helpers/staff.js";
import bcrypt from "bcryptjs";

function client() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", authRouter);
  app.get("/protected", requireAuth, (req, res) => res.json({ staff: req.staff }));
  app.use(errorHandler);
  return testClient(app);
}

const admin = { role: "ADMIN" } as const;
const incrementResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null };

describe("versioned staff sessions", () => {
  it("includes the persisted session version in a real login token", async () => {
    const staff = staffFixture("RECEPTIONIST", { sessionVersion: 7, permissions: ["members.read"] });
    mockLoginLookup(staff);
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const response = await client().post("/api/auth/login").send({ email: staff.email, password: "fictional-test-password" });
    expect(response.status).toBe(200);
    const cookies = response.headers["set-cookie"] as unknown as string[];
    const token = cookies[0]!.split(";")[0]!.slice("wf_session=".length);
    expect(verifyAuthToken(token).sessionVersion).toBe(7);
    expect(response.body.staff.permissions).toEqual(["members.read"]);
    expect(response.body.staff).not.toHaveProperty("sessionVersion");
  });

  it("accepts a new version-zero token for a legacy staff record", async () => {
    const staff = staffFixture("RECEPTIONIST", { sessionVersion: undefined });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    expect((await client().get("/protected").set("Cookie", sessionCookie(staff.id))).status).toBe(200);
  });

  it("rejects a correctly signed versionless JWT and clears the old cookie", async () => {
    const lookup = vi.spyOn(Staff, "findById");
    const token = jwt.sign({}, env.JWT_SECRET, { algorithm: "HS256", subject: staffFixture().id, expiresIn: "8h", issuer: "warrior-fitness", audience: "warrior-fitness-web" });
    const response = await client().get("/protected").set("Cookie", `wf_session=${token}`);
    expect(response.status).toBe(401);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, "0", null])("rejects an invalid session-version claim (%s)", async (sessionVersion) => {
    const lookup = vi.spyOn(Staff, "findById");
    const token = jwt.sign({ sessionVersion }, env.JWT_SECRET, { subject: staffFixture().id, expiresIn: "8h", issuer: "warrior-fitness", audience: "warrior-fitness-web" });
    expect((await client().get("/protected").set("Cookie", `wf_session=${token}`)).status).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects an outdated version even when the account is active", async () => {
    const staff = staffFixture("RECEPTIONIST", { sessionVersion: 2 });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    expect((await client().get("/protected").set("Cookie", sessionCookie(staff.id, 1))).status).toBe(401);
  });

  it("logout atomically revokes the account's other sessions", async () => {
    const staff = staffFixture();
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const update = vi.spyOn(Staff, "updateOne").mockResolvedValue(incrementResult);
    const firstDevice = sessionCookie(staff.id);
    const secondDevice = sessionCookie(staff.id);
    expect((await client().get("/protected").set("Cookie", secondDevice)).status).toBe(200);
    const response = await client().post("/api/auth/logout").set("Cookie", firstDevice);
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      { _id: staff.id, $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] },
      { $inc: { sessionVersion: 1 } }
    );
    // Simulate the persisted result of the asserted atomic increment, without a DB.
    staff.sessionVersion = 1;
    expect((await client().get("/protected").set("Cookie", secondDevice)).status).toBe(401);
    expect((await client().get("/protected").set("Cookie", sessionCookie(staff.id, 1))).status).toBe(200);
  });

  it("a stale logout cannot revoke sessions created at a newer version", async () => {
    const staff = staffFixture("ADMIN", { sessionVersion: 4 });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const update = vi.spyOn(Staff, "updateOne").mockResolvedValue({ ...incrementResult, matchedCount: 0, modifiedCount: 0 });
    expect((await client().post("/api/auth/logout").set("Cookie", sessionCookie(staff.id, 3))).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ _id: staff.id, sessionVersion: 3 }, { $inc: { sessionVersion: 1 } });
    expect((await client().get("/protected").set("Cookie", sessionCookie(staff.id, 4))).status).toBe(200);
  });

  it("clears invalid logout cookies without querying or updating staff", async () => {
    const update = vi.spyOn(Staff, "updateOne");
    const response = await client().post("/api/auth/logout").set("Cookie", "wf_session=invalid");
    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });

  it("does not report successful logout or clear its cookie when revocation fails", async () => {
    vi.spyOn(Staff, "updateOne").mockRejectedValue(new Error("Fictional storage failure"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await client().post("/api/auth/logout").set("Cookie", sessionCookie(staffFixture().id));
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ success: false, message: "Internal server error" });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses to create tokens with invalid versions", () => {
    expect(() => createAuthToken(staffFixture().id, -1)).toThrow("Invalid session version");
  });
});

describe("atomic security-write service for future staff management", () => {
  it.each([
    ["role", { role: "ADMIN" }],
    ["permission", { permissions: [] }],
    ["password", { passwordHash: "fictional-changed-password-hash" }],
    ["profile", { fullName: "Changed Example", email: "changed@example.test" }],
  ] as const)("rejects old tokens after an approved %s change", async (_label, change) => {
    const original = staffFixture("RECEPTIONIST");
    const cookie = sessionCookie(original.id);
    const updated = staffFixture("RECEPTIONIST", { sessionVersion: 1 });
    if ("role" in change) updated.role = change.role;
    if ("permissions" in change) updated.permissions = [...change.permissions];
    if ("passwordHash" in change) updated.passwordHash = change.passwordHash;
    vi.spyOn(Staff, "findOneAndUpdate").mockResolvedValue(updated);
    const result = await updateStaffSecurity(admin, original.id, 0, change as StaffSecurityChange);
    vi.spyOn(Staff, "findById").mockResolvedValue(result);
    expect((await client().get("/protected").set("Cookie", cookie)).status).toBe(401);
    const response = await client().get("/protected").set("Cookie", sessionCookie(original.id, 1));
    expect(response.status).toBe(200);
    if (_label === "permission") expect(response.body.staff.permissions).toEqual([]);
    if (_label === "role") expect(response.body.staff.role).toBe("ADMIN");
  });

  it.each([
    ["role", { role: "ADMIN" }],
    ["permissions", { permissions: ["members.read"] }],
    ["password", { passwordHash: "fictional-replacement-password-hash" }],
    ["deactivation", { isActive: false }],
    ["reactivation", { isActive: true }],
    ["profile", { fullName: "Changed Example", email: "changed@example.test" }],
  ] as const)("updates %s and increments the version in the same conditional write", async (_label, change) => {
    const staff = staffFixture("RECEPTIONIST", { sessionVersion: 6 });
    const update = vi.spyOn(Staff, "findOneAndUpdate").mockResolvedValue(staff);
    await updateStaffSecurity(admin, staff.id, 5, change as StaffSecurityChange);
    expect(update).toHaveBeenCalledWith({ _id: staff.id, sessionVersion: 5 }, { $set: change, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true });
  });

  it("deactivate/reactivate never restores tokens from before deactivation", async () => {
    const staff = staffFixture("RECEPTIONIST");
    const cookie = sessionCookie(staff.id);
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const update = vi.spyOn(Staff, "findOneAndUpdate").mockResolvedValue(staff);
    await updateStaffSecurity(admin, staff.id, 0, { isActive: false });
    staff.isActive = false;
    staff.sessionVersion = 1;
    expect((await client().get("/protected").set("Cookie", cookie)).status).toBe(401);
    await updateStaffSecurity(admin, staff.id, 1, { isActive: true });
    staff.isActive = true;
    staff.sessionVersion = 2;
    expect((await client().get("/protected").set("Cookie", cookie)).status).toBe(401);
    expect((await client().get("/protected").set("Cookie", sessionCookie(staff.id, 2))).status).toBe(200);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("can explicitly deny all operations or reset to legacy role defaults", async () => {
    const staff = staffFixture("RECEPTIONIST");
    const update = vi.spyOn(Staff, "findOneAndUpdate").mockResolvedValue(staff);
    await updateStaffSecurity(admin, staff.id, 1, { permissions: [] });
    expect(update).toHaveBeenLastCalledWith({ _id: staff.id, sessionVersion: 1 }, { $set: { permissions: [] }, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true });
    await updateStaffSecurity(admin, staff.id, 2, { permissions: null });
    expect(update).toHaveBeenLastCalledWith({ _id: staff.id, sessionVersion: 2 }, { $set: {}, $unset: { permissions: 1 }, $inc: { sessionVersion: 1 } }, { new: true, runValidators: true });
  });

  it("rejects a stale concurrent update rather than overwriting newer security settings", async () => {
    const staff = staffFixture();
    vi.spyOn(Staff, "findOneAndUpdate").mockResolvedValue(null);
    await expect(updateStaffSecurity(admin, staff.id, 1, { isActive: false })).rejects.toHaveProperty("statusCode", 409);
  });

  it("rejects Receptionist security changes before a database write", async () => {
    const update = vi.spyOn(Staff, "findOneAndUpdate");
    await expect(updateStaffSecurity({ role: "RECEPTIONIST" }, staffFixture().id, 0, { permissions: [] })).rejects.toHaveProperty("statusCode", 403);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects unknown or Admin-only permission assignments", async () => {
    const update = vi.spyOn(Staff, "findOneAndUpdate");
    await expect(updateStaffSecurity(admin, staffFixture().id, 0, { permissions: ["reports.read"] } as unknown as StaffSecurityChange)).rejects.toHaveProperty("statusCode", 400);
    expect(update).not.toHaveBeenCalled();
  });
});
