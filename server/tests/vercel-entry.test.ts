import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vercelApp from "../index.js";
import { initializeApplication } from "../src/config/initialize.js";
import { env } from "../src/config/env.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { DemoSession } from "../src/modules/auth/demo-session.model.js";
import { DEMO_VIEWER_EMAIL, DEMO_VIEWER_ID } from "../src/modules/auth/demo-access.js";
import { createAuthToken } from "../src/modules/auth/token.js";
import { testClient } from "./helpers/http.js";
import { mockLoginLookup, staffFixture, sessionCookie } from "./helpers/staff.js";

vi.mock("../src/config/initialize.js", () => ({ initializeApplication: vi.fn() }));
vi.mock("../src/config/env.js", async original => {
  const actual = await original<typeof import("../src/config/env.js")>();
  return { ...actual, env: { ...actual.env, NODE_ENV: "production", CLIENT_URL: "https://warrior-ui.example.test", DEMO_PUBLIC_LOGIN_ENABLED: true } };
});
// An accidental import of either process startup path fails this suite.
vi.mock("../src/modules/notifications/notification.scheduler.js", () => { throw new Error("Vercel must never import the background scheduler"); });

const originalDb = Object.getOwnPropertyDescriptor(mongoose.connection, "db");
const origin = "https://warrior-ui.example.test";
const demoId = "ab".repeat(32);
const viewer = () => new Staff({ _id: DEMO_VIEWER_ID, email: DEMO_VIEWER_EMAIL, fullName: "Demo Visitor", role: "ADMIN", isActive: true, sessionVersion: 0, isDemoViewer: true });
function useViewer() {
  vi.spyOn(Staff, "findOne").mockResolvedValue(viewer());
  vi.spyOn(Staff, "findById").mockResolvedValue(viewer());
  vi.spyOn(DemoSession, "createIndexes").mockResolvedValue(undefined);
  vi.spyOn(DemoSession, "create").mockResolvedValue({} as never);
  vi.spyOn(DemoSession, "exists").mockResolvedValue({ _id: "fictional-digest" });
}

beforeEach(() => {
  vi.mocked(initializeApplication).mockReset().mockResolvedValue(undefined);
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  Object.defineProperty(mongoose.connection, "db", { configurable: true, value: { databaseName: "warrior_fitness_demo" } });
  env.DEMO_PUBLIC_LOGIN_ENABLED = true;
});
afterEach(() => {
  if (originalDb) Object.defineProperty(mongoose.connection, "db", originalDb);
  else Reflect.deleteProperty(mongoose.connection, "db");
});

describe("native Vercel Express entry point", () => {
  it("exports Express without starting a port listener or notification scheduler", () => {
    expect(typeof vercelApp).toBe("function");
    expect(vercelApp.get("x-powered-by")).toBe(false);
    expect(initializeApplication).not.toHaveBeenCalled();
  });

  it("preserves /api paths and the existing health response", async () => {
    const result = await testClient(vercelApp).get("/api/health");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ service: "warrior-fitness-api", database: "connected" });
    expect(result.headers["cache-control"]).toBe("no-store");
    expect((await testClient(vercelApp).get("/health")).status).toBe(404);
  });

  it("waits for readiness before reaching authentication handlers", async () => {
    let ready!: () => void;
    vi.mocked(initializeApplication).mockReturnValue(new Promise<void>(resolve => { ready = resolve; }));
    const lookup = vi.spyOn(Staff, "findOne");
    let complete = false;
    const pending = testClient(vercelApp).post("/api/auth/login").set("Origin", origin).send({}).then(response => { complete = true; return response; });
    await vi.waitFor(() => expect(initializeApplication).toHaveBeenCalledTimes(1));
    expect(complete).toBe(false); expect(lookup).not.toHaveBeenCalled();
    ready();
    expect((await pending).status).toBe(400);
  });

  it("returns a sanitized retryable 503 without reaching routes after initialization failure", async () => {
    vi.mocked(initializeApplication).mockRejectedValueOnce(new Error("fictional-private-connection-details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const lookup = vi.spyOn(Staff, "findOne");
    const failed = await testClient(vercelApp).post("/api/auth/login").set("Origin", origin).send({});
    expect(failed.status).toBe(503); expect(lookup).not.toHaveBeenCalled();
    expect(JSON.stringify(failed.body)).not.toContain("fictional-private-connection-details");
    expect(JSON.stringify(log.mock.calls)).not.toContain("fictional-private-connection-details");
    expect(failed.headers["cache-control"]).toBe("no-store");
    expect((await testClient(vercelApp).get("/api/health")).status).toBe(200);
  });

  it("preserves normal login and a host-only production cookie usable through /api", async () => {
    mockLoginLookup(staffFixture());
    vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const result = await testClient(vercelApp).post("/api/auth/login").set("Origin", origin).send({ email: "admin@example.test", password: "fictional-only" });
    expect(result.status).toBe(200); expect(result.body.staff.readOnly).toBeUndefined();
    const cookie = result.headers["set-cookie"]![0]!;
    for (const attribute of ["HttpOnly", "Secure", "SameSite=None", "Path=/api", "Max-Age=28800"]) expect(cookie).toContain(attribute);
    expect(cookie).not.toMatch(/Domain=/i);
    expect(result.headers["cache-control"]).toBe("no-store");
  });

  it("preserves one-click demo login, session refresh and matching logout cookie attributes", async () => {
    useViewer();
    const login = await testClient(vercelApp).post("/api/auth/demo-login").set("Origin", origin).send({});
    expect(login.status).toBe(200); expect(login.body.staff.readOnly).toBe(true);
    const cookie = login.headers["set-cookie"]![0]!;
    expect(cookie).toContain("Secure"); expect(cookie).not.toMatch(/Domain=/i);
    const session = cookie.split(";")[0]!;
    expect((await testClient(vercelApp).get("/api/auth/me").set("Cookie", session)).body.staff.readOnly).toBe(true);
    const remove = vi.spyOn(DemoSession, "deleteOne").mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    const staffUpdate = vi.spyOn(Staff, "updateOne");
    const logout = await testClient(vercelApp).post("/api/auth/logout").set("Origin", origin).set("Cookie", session);
    expect(logout.status).toBe(200); expect(remove).toHaveBeenCalledTimes(1); expect(staffUpdate).not.toHaveBeenCalled();
    expect(logout.headers["set-cookie"]![0]).toContain("Path=/api");
    expect(logout.headers["set-cookie"]![0]).toContain("Secure");
  });

  it.each([undefined, "https://attacker.example.test", "https://warrior-api.example.test"])("keeps the configured frontend origin mandatory (%s)", async suppliedOrigin => {
    const lookup = vi.spyOn(Staff, "findOne");
    const request = testClient(vercelApp).post("/api/auth/demo-login");
    if (suppliedOrigin) request.set("Origin", suppliedOrigin);
    expect((await request.send({})).status).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses public demo login against the original gym database", async () => {
    Object.defineProperty(mongoose.connection, "db", { configurable: true, value: { databaseName: "warriorfitnessv2" } });
    const lookup = vi.spyOn(Staff, "findOne");
    expect((await testClient(vercelApp).post("/api/auth/demo-login").set("Origin", origin).send({})).status).toBe(503);
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(["/api/members", "/api/memberships/renew", "/api/payments", "/api/attendance/check-in", "/api/staff", "/api/expenses", "/api/cash-closings", "/api/retail/checkout", "/api/equipment", "/api/notifications/simulate-due"])("retains server-side demo write rejection at %s", async path => {
    useViewer();
    const cookie = `wf_session=${createAuthToken(DEMO_VIEWER_ID, 0, demoId)}`;
    const response = await testClient(vercelApp).post(path).set("Origin", origin).set("Cookie", cookie).send({});
    expect(response.status).toBe(403); expect(response.body.message).toContain("Read Only");
  });

  it("preserves normal Admin write access through existing validation", async () => {
    vi.spyOn(Staff, "findById").mockResolvedValue(staffFixture());
    const result = await testClient(vercelApp).post("/api/payments").set("Origin", origin).set("Cookie", sessionCookie(staffFixture().id)).send({});
    expect(result.status).toBe(400);
    expect(result.body.message).not.toContain("Read Only");
  });
});
