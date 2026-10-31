import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authRouter } from "../src/modules/auth/auth.routes.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { verifyAuthToken } from "../src/modules/auth/token.js";
import { testClient } from "./helpers/http.js";
import { mockLoginLookup, sessionCookie, staffFixture } from "./helpers/staff.js";

const limiterStores = vi.hoisted(() => [] as Array<{ resetAll(): void | Promise<void>; shutdown(): void }>);

// Inject the real store so its counters can be reset without disabling the limiter.
vi.mock("express-rate-limit", async (importOriginal) => {
  const original = await importOriginal<typeof import("express-rate-limit")>();
  return {
    ...original,
    rateLimit: (options: Parameters<typeof original.rateLimit>[0]) => {
      const store = new original.MemoryStore();
      limiterStores.push(store);
      return original.rateLimit({ ...options, store });
    },
  };
});

function authClient() {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use("/api/auth", authRouter);
  return testClient(app);
}

const credentials = { email: "admin@example.test", password: "fictional-test-password" };

describe("actual staff authentication routes", () => {
  beforeEach(async () => {
    await Promise.all(limiterStores.map((store) => store.resetAll()));
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
  });

  afterAll(() => {
    for (const store of limiterStores) store.shutdown();
  });

  it.each(["ADMIN", "RECEPTIONIST"] as const)("logs in an active %s with valid credentials", async (role) => {
    const staff = staffFixture(role);
    const { lookup, select } = mockLoginLookup(staff);
    const response = await authClient().post("/api/auth/login").send({ ...credentials, email: staff.email });
    expect(response.status).toBe(200);
    expect(response.body.staff).toMatchObject({ id: staff.id, role, isActive: true });
    expect(lookup).toHaveBeenCalledWith({ email: staff.email });
    expect(select).toHaveBeenCalledWith("+passwordHash");
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it("sets a verifiable eight-hour wf_session cookie with the existing security attributes", async () => {
    const staff = staffFixture();
    mockLoginLookup(staff);
    const response = await authClient().post("/api/auth/login").send(credentials);
    const cookies = response.headers["set-cookie"] as unknown as string[];
    const [session, ...attributes] = cookies[0]!.split("; ");
    expect(session!.startsWith("wf_session=")).toBe(true);
    const claims = verifyAuthToken(session!.slice("wf_session=".length));
    expect(claims.staffId === staff.id && claims.sessionVersion === 0).toBe(true);
    expect(attributes).toEqual(expect.arrayContaining(["HttpOnly", "Path=/api", "SameSite=Lax", "Max-Age=28800"]));
    expect(attributes).not.toContain("Secure"); // NODE_ENV=test uses the non-production cookie setting.
  });

  it("rejects an invalid password without issuing a session", async () => {
    mockLoginLookup(staffFixture());
    vi.mocked(bcrypt.compare).mockImplementation(async () => false);
    const response = await authClient().post("/api/auth/login").send(credentials);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("retains the real login limiter's ten-failed-attempt threshold", async () => {
    const { lookup } = mockLoginLookup(staffFixture());
    vi.mocked(bcrypt.compare).mockImplementation(async () => false);
    const client = authClient();
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await client.post("/api/auth/login").send(credentials)).status).toBe(401);
    }
    const response = await client.post("/api/auth/login").send(credentials);
    expect(response.status).toBe(429);
    expect(lookup).toHaveBeenCalledTimes(10);
  });

  it.each([
    ["unknown", null],
    ["inactive", staffFixture("ADMIN", { isActive: false })],
  ] as const)("rejects an %s account with the same generic credential error", async (_label, staff) => {
    mockLoginLookup(staff);
    const response = await authClient().post("/api/auth/login").send(credentials);
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it.each([
    ["missing fields", {}],
    ["invalid email", { ...credentials, email: "invalid" }],
    ["empty password", { ...credentials, password: "" }],
  ])("rejects a payload with %s before looking up staff", async (_label, payload) => {
    const { lookup } = mockLoginLookup(null);
    const response = await authClient().post("/api/auth/login").send(payload);
    expect(response.status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("exposes only the intended public staff fields in login JSON", async () => {
    mockLoginLookup(staffFixture());
    const response = await authClient().post("/api/auth/login").send(credentials);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(["message", "staff", "success"]);
    expect(Object.keys(response.body.staff).sort()).toEqual(["email", "fullName", "id", "isActive", "permissions", "role"]);
    expect(JSON.stringify(response.body).includes("eyJ")).toBe(false);
    expect(JSON.stringify(response.body).includes("passwordHash")).toBe(false);
  });

  it("returns current staff information from /me with a valid session", async () => {
    const staff = staffFixture();
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const response = await authClient().get("/api/auth/me").set("Cookie", sessionCookie(staff.id));
    expect(response.status).toBe(200);
    expect(response.body.staff).toMatchObject({ id: staff.id, fullName: staff.fullName, email: staff.email, role: staff.role });
    expect(response.body.staff.permissions).toEqual(expect.arrayContaining(["staff.manage", "reports.read"]));
  });

  it("rejects /me without a session before querying staff", async () => {
    const lookup = vi.spyOn(Staff, "findById");
    const response = await authClient().get("/api/auth/me");
    expect(response.status).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("clears the session cookie on logout using the matching path and attributes", async () => {
    const response = await authClient().post("/api/auth/logout");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: "Logged out successfully" });
    const cookies = response.headers["set-cookie"] as unknown as string[];
    const [session, ...attributes] = cookies[0]!.split("; ");
    expect(session).toBe("wf_session=");
    expect(attributes).toEqual(expect.arrayContaining(["Path=/api", "HttpOnly", "SameSite=Lax", "Expires=Thu, 01 Jan 1970 00:00:00 GMT"]));
  });
});
