import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { env, envSchema } from "../src/config/env.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { DemoSession, demoSessionDigest } from "../src/modules/auth/demo-session.model.js";
import { DEMO_VIEWER_EMAIL, DEMO_VIEWER_ID, demoReadPermitted } from "../src/modules/auth/demo-access.js";
import { provisionDemoViewer } from "../src/modules/auth/demo-login.service.js";
import { createAuthToken, verifyAuthToken } from "../src/modules/auth/token.js";
import { updateStaffSecurity } from "../src/modules/auth/staff-security.service.js";
import { testClient } from "./helpers/http.js";
import { mockLoginLookup, staffFixture, sessionCookie } from "./helpers/staff.js";

vi.mock("../src/config/env.js", async original => {
  const actual = await original<typeof import("../src/config/env.js")>();
  return { ...actual, env: { ...actual.env, DEMO_PUBLIC_LOGIN_ENABLED: true } };
});
const stores = vi.hoisted(() => [] as Array<{ resetAll(): void | Promise<void>; shutdown(): void }>);
vi.mock("express-rate-limit", async original => {
  const actual = await original<typeof import("express-rate-limit")>();
  return { ...actual, rateLimit: (options: Parameters<typeof actual.rateLimit>[0]) => {
    const store = new actual.MemoryStore(); stores.push(store); return actual.rateLimit({ ...options, store });
  } };
});
const originalDb = Object.getOwnPropertyDescriptor(mongoose.connection, "db");
const sessionId = "ab".repeat(32);
const viewer = () => new Staff({ _id: DEMO_VIEWER_ID, fullName: "Demo Visitor", email: DEMO_VIEWER_EMAIL, role: "ADMIN", isActive: true, sessionVersion: 0, isDemoViewer: true, passwordHash: "fictional-unusable-password-hash" });
const demoCookie = (id = sessionId) => `wf_session=${createAuthToken(DEMO_VIEWER_ID, 0, id)}`;
function database(name = "warrior_fitness_demo") {
  Object.defineProperty(mongoose.connection, "db", { value: { databaseName: name }, configurable: true });
}
function login(client = testClient(app)) { return client.post("/api/auth/demo-login").set("Origin", env.CLIENT_URL).send({}); }
beforeEach(async () => {
  env.DEMO_PUBLIC_LOGIN_ENABLED = true;
  vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);
  database();
  await Promise.all(stores.map(store => store.resetAll()));
  vi.spyOn(DemoSession, "createIndexes").mockResolvedValue(undefined);
  vi.spyOn(DemoSession, "create").mockResolvedValue({} as never);
  vi.spyOn(DemoSession, "exists").mockResolvedValue({ _id: demoSessionDigest(sessionId) });
  vi.spyOn(Staff, "findById").mockResolvedValue(viewer());
  vi.spyOn(Staff, "findOne").mockResolvedValue(viewer());
});
afterEach(() => {
  if (originalDb) Object.defineProperty(mongoose.connection, "db", originalDb); else Reflect.deleteProperty(mongoose.connection, "db");
});
afterAll(() => stores.forEach(store => store.shutdown()));

describe("public demo login and dedicated identity", () => {
  it("signs in without a password, with the same HttpOnly eight-hour session and an explicit read-only identity", async () => {
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.body.staff).toMatchObject({ id: DEMO_VIEWER_ID, role: "ADMIN", readOnly: true });
    const cookie = (response.headers["set-cookie"] as unknown as string[])[0]!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Max-Age=28800"); expect(cookie).toContain("Path=/api");
    const claims = verifyAuthToken(cookie.split(";")[0]!.slice("wf_session=".length));
    expect(claims.demoSessionId).toMatch(/^[a-f0-9]{64}$/);
    expect(DemoSession.create).toHaveBeenCalledWith(expect.objectContaining({ _id: demoSessionDigest(claims.demoSessionId!), expiresAt: new Date(Date.now() + 28_800_000) }));
    expect(JSON.stringify(response.body)).not.toMatch(/password|eyJ|demoSessionId/);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it.each(["warrior_fitness_db", "admin", "warrior_fitness_demo_copy", ""])("refuses database %s before any identity/session write", async name => {
    database(name);
    expect((await login()).status).toBe(503);
    expect(Staff.findOne).not.toHaveBeenCalled(); expect(DemoSession.create).not.toHaveBeenCalled();
  });
  it("refuses a disabled flag without querying accounts", async () => {
    env.DEMO_PUBLIC_LOGIN_ENABLED = false;
    expect((await login()).status).toBe(503); expect(Staff.findOne).not.toHaveBeenCalled();
  });
  it("refuses a disconnected database whose old name still matches", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);
    expect((await login()).status).toBe(503); expect(DemoSession.create).not.toHaveBeenCalled();
  });
  it.each([undefined, "null", "https://attacker.example.test"])("rejects untrusted/missing origin %s", async origin => {
    const request = testClient(app).post("/api/auth/demo-login"); if (origin) request.set("Origin", origin);
    expect((await request.send({})).status).toBe(403); expect(Staff.findOne).not.toHaveBeenCalled();
  });
  it("counts successful demo logins in its independent rate limit", async () => {
    const client = testClient(app);
    for (let i = 0; i < 15; i++) expect((await login(client)).status).toBe(200);
    expect((await login(client)).status).toBe(429); expect(DemoSession.create).toHaveBeenCalledTimes(15);
  });
  it("cannot select a normal Admin or turn off read-only mode through request input", async () => {
    const response = await testClient(app).post("/api/auth/demo-login").set("Origin", env.CLIENT_URL).send({ staffId: staffFixture().id, readOnly: false, role: "ADMIN", database: "warrior_fitness_db" });
    expect(response.status).toBe(200); expect(response.body.staff.id).toBe(DEMO_VIEWER_ID); expect(response.body.staff.readOnly).toBe(true);
  });
  it("provisions only with setOnInsert and leaves repeat logins unchanged", async () => {
    vi.mocked(Staff.findOne).mockResolvedValueOnce(null);
    vi.spyOn(bcrypt, "hash").mockImplementation(async () => "fictional-random-hash");
    const upsert = vi.spyOn(Staff, "findOneAndUpdate").mockResolvedValue(viewer());
    await provisionDemoViewer(); await provisionDemoViewer();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({ _id: DEMO_VIEWER_ID, email: DEMO_VIEWER_EMAIL, isDemoViewer: true }, { $setOnInsert: expect.objectContaining({ role: "ADMIN", sessionVersion: 0 }) }, expect.objectContaining({ upsert: true, timestamps: false }));
  });
  it("handles a concurrent provisioning duplicate by reading and verifying the reserved identity", async () => {
    vi.mocked(Staff.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(viewer());
    vi.spyOn(bcrypt, "hash").mockImplementation(async () => "fictional-random-hash");
    vi.spyOn(Staff, "findOneAndUpdate").mockRejectedValue({ code: 11000 });
    await expect(provisionDemoViewer()).resolves.toMatchObject({ id: DEMO_VIEWER_ID, isDemoViewer: true });
  });
  it("never overwrites a colliding ordinary Admin account", async () => {
    vi.mocked(Staff.findOne).mockResolvedValue(staffFixture("ADMIN", { email: DEMO_VIEWER_EMAIL }));
    const update = vi.spyOn(Staff, "findOneAndUpdate");
    expect((await login()).status).toBe(503); expect(update).not.toHaveBeenCalled(); expect(DemoSession.create).not.toHaveBeenCalled();
  });
  it("blocks password login for the viewer even with a fabricated valid password result", async () => {
    mockLoginLookup(viewer()); const compare = vi.spyOn(bcrypt, "compare");
    const result = await testClient(app).post("/api/auth/login").send({ email: DEMO_VIEWER_EMAIL, password: "fictional-password" });
    expect(result.status).toBe(401); expect(compare).not.toHaveBeenCalled();
  });
  it("preserves ordinary Admin password login without marking it read-only", async () => {
    mockLoginLookup(staffFixture()); vi.spyOn(bcrypt, "compare").mockImplementation(async () => true);
    const result = await testClient(app).post("/api/auth/login").send({ email: "admin@example.test", password: "fictional-password" });
    expect(result.status).toBe(200); expect(result.body.staff.readOnly).toBeUndefined();
  });
  it("validates the server flag strictly and defaults it to disabled", () => {
    const input = { MONGODB_URI: "mongodb://127.0.0.1:1/fictional", JWT_SECRET: "fictional-unit-testing-signing-key-only" };
    expect(envSchema.parse(input).DEMO_PUBLIC_LOGIN_ENABLED).toBe(false);
    expect(envSchema.safeParse({ ...input, DEMO_PUBLIC_LOGIN_ENABLED: "yes" }).success).toBe(false);
  });
  it("does not expose storage failures or issue cookies after a failed session write", async () => {
    vi.mocked(DemoSession.create).mockRejectedValue(new Error("fictional-private-storage-details"));
    const response = await login();
    expect(response.status).toBe(503); expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain("fictional-private-storage-details");
  });
});

const id = "000000000000000000000003";
const mutations = [
  ["post", "/api/members"], ["patch", `/api/members/${id}`], ["patch", `/api/members/${id}/status`],
  ["post", "/api/plans"], ["patch", `/api/plans/${id}`], ["patch", `/api/plans/${id}/status`],
  ["post", "/api/memberships"], ["post", "/api/memberships/renew"], ["post", "/api/invoices"], ["post", "/api/payments"],
  ["post", "/api/attendance/check-in"], ["post", "/api/attention/follow-ups"],
  ["post", "/api/staff"], ["patch", `/api/staff/${id}/profile`], ["patch", `/api/staff/${id}/permissions`], ["patch", `/api/staff/${id}/status`], ["post", `/api/staff/${id}/reset-password`],
  ["post", "/api/expenses"], ["delete", `/api/expenses/${id}`], ["post", "/api/cash-closings"], ["put", `/api/cash-closings/${id}`],
  ["put", "/api/notifications/consent"], ["post", "/api/notifications/simulate-due"],
  ["post", "/api/equipment"], ["put", `/api/equipment/${id}`], ["patch", `/api/equipment/${id}/status`], ["post", `/api/equipment/${id}/incidents`], ["patch", `/api/equipment/${id}/incidents/${id}`],
  ["post", `/api/equipment/${id}/work-orders`], ["patch", `/api/equipment/${id}/work-orders/${id}/assignment`], ["post", `/api/equipment/${id}/work-orders/${id}/transition`], ["post", `/api/equipment/${id}/work-orders/${id}/expenses`],
  ["post", "/api/retail/products"], ["put", `/api/retail/products/${id}`], ["post", `/api/retail/products/${id}/stock`], ["post", "/api/retail/checkout"],
] as const;
describe("server-enforced read-only sessions", () => {
  it.each(mutations)("rejects %s %s before business validation or persistence", async (method, path) => {
    const response = await testClient(app)[method](path).set("Cookie", demoCookie()).send({});
    expect(response.status).toBe(403); expect(response.body.message).toContain("Read Only");
  });
  it.each(["/api/members/export-and-delete", "/api/notifications/simulate-due", "/api/retail/checkout", "/api/expenses/recalculate"])("refuses unaudited or unusual GET %s", async path => {
    expect((await testClient(app).get(path).set("Cookie", demoCookie())).status).toBe(403);
  });
  it.each(["/api/members", `/api/memberships/member/${id}`, "/api/reports/revenue/collections", "/api/attendance", "/api/retail/dashboard", "/api/equipment/maintenance", "/api/expenses", "/api/cash-closings/day/2026-01-15"])("allows audited read policy %s, with no mutation-method grant", path => {
    expect(demoReadPermitted("GET", path)).toBe(true); expect(demoReadPermitted("HEAD", path)).toBe(true); expect(demoReadPermitted("POST", path)).toBe(false);
  });
  it("restores the viewer session through the existing /me endpoint", async () => {
    const response = await testClient(app).get("/api/auth/me").set("Cookie", demoCookie());
    expect(response.status).toBe(200); expect(response.body.staff.readOnly).toBe(true);
  });
  it("rejects a revoked/expired per-visitor session", async () => {
    vi.mocked(DemoSession.exists).mockResolvedValue(null);
    expect((await testClient(app).get("/api/auth/me").set("Cookie", demoCookie())).status).toBe(401);
  });
  it("rejects demo JWTs after disabling the flag or switching databases, before reading staff", async () => {
    env.DEMO_PUBLIC_LOGIN_ENABLED = false;
    expect((await testClient(app).get("/api/auth/me").set("Cookie", demoCookie())).status).toBe(401);
    env.DEMO_PUBLIC_LOGIN_ENABLED = true; database("warrior_fitness_db");
    expect((await testClient(app).get("/api/auth/me").set("Cookie", demoCookie())).status).toBe(401);
    expect(Staff.findById).not.toHaveBeenCalled();
  });
  it("rejects a normal JWT used for the demo identity", async () => {
    expect((await testClient(app).get("/api/auth/me").set("Cookie", sessionCookie(DEMO_VIEWER_ID))).status).toBe(401);
  });
  it("cannot use a demo session discriminator for an ordinary Admin", async () => {
    vi.mocked(Staff.findById).mockResolvedValue(staffFixture());
    const cookie = `wf_session=${createAuthToken(staffFixture().id, 0, sessionId)}`;
    expect((await testClient(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(401);
  });
  it("revokes only the signing-out visitor; other visitors and normal Admin sessions survive", async () => {
    const deleted = new Set<string>();
    vi.spyOn(DemoSession, "deleteOne").mockImplementation(((filter: { _id: string }) => { deleted.add(filter._id); return Promise.resolve({ deletedCount: 1, acknowledged: true }); }) as never);
    vi.mocked(DemoSession.exists).mockImplementation(((filter: { _id: string }) => Promise.resolve(deleted.has(filter._id) ? null : { _id: filter._id })) as never);
    const staffUpdate = vi.spyOn(Staff, "updateOne");
    expect((await testClient(app).post("/api/auth/logout").set("Cookie", demoCookie())).status).toBe(200);
    expect((await testClient(app).get("/api/auth/me").set("Cookie", demoCookie())).status).toBe(401);
    expect((await testClient(app).get("/api/auth/me").set("Cookie", demoCookie("cd".repeat(32)))).status).toBe(200);
    expect(staffUpdate).not.toHaveBeenCalled();
    vi.mocked(Staff.findById).mockResolvedValue(staffFixture());
    expect((await testClient(app).get("/api/auth/me").set("Cookie", sessionCookie(staffFixture().id))).status).toBe(200);
  });
  it("preserves normal Admin mutation authorization", async () => {
    vi.mocked(Staff.findById).mockResolvedValue(staffFixture());
    // Invalid data reaches existing business validation, rather than the demo guard.
    expect((await testClient(app).post("/api/payments").set("Cookie", sessionCookie(staffFixture().id)).send({})).status).toBe(400);
  });
  it("rejects internal security mutations from a read-only actor", async () => {
    await expect(updateStaffSecurity({ role: "ADMIN", readOnly: true }, id, 0, { isActive: false })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("excludes the dedicated identity from every normal security update filter", async () => {
    const update = vi.spyOn(Staff, "findOneAndUpdate").mockResolvedValue(null);
    await expect(updateStaffSecurity({ role: "ADMIN" }, DEMO_VIEWER_ID, 0, { passwordHash: "fictional-replacement-hash" })).rejects.toMatchObject({ statusCode: 409 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ isDemoViewer: { $ne: true } }), expect.anything(), expect.anything());
  });
  it("retains the production cookie and origin protections for demo login", async () => {
    // Same cookie options are used by both login paths; actual production
    // Secure/SameSite/origin behavior is also exercised by deployment.test.ts.
    const response = await login();
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });
  it("requires explicit review coverage for every currently registered business GET route", () => {
    const modules = ["members/member", "membership-plans/plan", "memberships/membership", "billing/invoice", "billing/payment", "attendance/attendance", "attention/attention", "reports/reports", "financial/financial", "equipment/equipment", "retail/retail", "notifications/notification", "staff/staff"];
    const prefixes: Record<string, string> = { memberRouter: "members", planRouter: "plans", membershipRouter: "memberships", invoiceRouter: "invoices", paymentRouter: "payments", attendanceRouter: "attendance", attentionRouter: "attention", reportsRouter: "reports", expenseRouter: "expenses", cashClosingRouter: "cash-closings", equipmentRouter: "equipment", retailRouter: "retail", notificationRouter: "notifications", staffRouter: "staff" };
    let readCount = 0;
    for (const module of modules) {
      const source = readFileSync(new URL(`../src/modules/${module}.routes.ts`, import.meta.url), "utf8");
      for (const match of source.matchAll(/(\w+Router)\.get\(\s*"([^"]+)"/g)) {
        const path = `/api/${prefixes[match[1]!]!}${match[2]!.replace(":date", "2026-01-15").replace(/:[\w]+/g, id)}`;
        expect(demoReadPermitted("GET", path), `Audited read: ${path}`).toBe(true); readCount++;
      }
    }
    expect(readCount).toBeGreaterThan(40);
  });
});
