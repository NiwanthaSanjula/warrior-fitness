import express from "express";
import cookieParser from "cookie-parser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Staff } from "../src/modules/auth/staff.model.js";
import { staffRouter } from "../src/modules/staff/staff.routes.js";
import * as service from "../src/modules/staff/staff.service.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { testClient } from "./helpers/http.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";

vi.mock("../src/modules/staff/staff.service.js", () => ({ createReceptionist: vi.fn(), getManagedStaff: vi.fn(), listStaff: vi.fn(), listStaffAudit: vi.fn(), mutateStaff: vi.fn() }));
const targetId = "000000000000000000000002";
const profile = { fullName: "Example Receptionist", email: "reception@example.test", expectedVersion: 0 };
function client() {
  const app = express(); app.use(express.json(), cookieParser()); app.use("/api/staff", staffRouter); app.use(errorHandler); return testClient(app);
}
beforeEach(() => {
  vi.mocked(service.createReceptionist).mockResolvedValue({ role: "RECEPTIONIST" } as never);
  vi.mocked(service.getManagedStaff).mockResolvedValue({ role: "RECEPTIONIST" } as never);
  vi.mocked(service.listStaff).mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
  vi.mocked(service.listStaffAudit).mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
  vi.mocked(service.mutateStaff).mockResolvedValue({ staff: {} as never, changed: true });
});

describe.each([
  ["get", "/api/staff", {}], ["get", "/api/staff/permissions", {}], ["get", "/api/staff/audit", {}], ["get", `/api/staff/${targetId}`, {}],
  ["post", "/api/staff", { fullName: profile.fullName, email: profile.email, password: "fictional-new-password" }],
  ["patch", `/api/staff/${targetId}/profile`, profile],
  ["patch", `/api/staff/${targetId}/permissions`, { permissions: [], expectedVersion: 0 }],
  ["patch", `/api/staff/${targetId}/status`, { isActive: false, expectedVersion: 0 }],
  ["post", `/api/staff/${targetId}/reset-password`, { password: "fictional-new-password", expectedVersion: 0 }],
] as const)("Staff Management %s %s", (method, path, body) => {
  it("rejects unauthenticated access before service execution", async () => {
    expect((await client()[method](path).send(body)).status).toBe(401);
    Object.values(service).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
  it("rejects Receptionists even with an injected staff.manage grant", async () => {
    const staff = staffFixture("RECEPTIONIST", { permissions: ["staff.manage"] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    expect((await client()[method](path).set("Cookie", sessionCookie(staff.id)).send(body)).status).toBe(403);
    Object.values(service).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
  it("allows an active Admin through the real authorization guards", async () => {
    const staff = staffFixture("ADMIN", { permissions: [] });
    vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    const response = await client()[method](path).set("Cookie", sessionCookie(staff.id)).send(body);
    expect(response.status).toBe(path === "/api/staff" && method === "post" ? 201 : 200);
  });
});

describe("staff endpoint validation and actor attribution", () => {
  beforeEach(() => vi.spyOn(Staff, "findById").mockResolvedValue(staffFixture("ADMIN")));
  it.each([
    ["patch", `/api/staff/${targetId}/profile`, { ...profile, role: "RECEPTIONIST" }],
    ["patch", `/api/staff/${targetId}/status`, { isActive: false }],
    ["patch", `/api/staff/${targetId}/permissions`, { expectedVersion: 0, permissions: ["reports.read"] }],
    ["patch", `/api/staff/${targetId}/permissions`, { expectedVersion: 0, permissions: ["members.read", "members.read"] }],
    ["post", `/api/staff/${targetId}/reset-password`, { expectedVersion: 0, password: "short" }],
    ["post", "/api/staff", { fullName: profile.fullName, email: profile.email, password: "fictional-new-password", role: "ADMIN" }],
  ] as const)("rejects invalid or privileged input on %s %s", async (method, path, body) => {
    expect((await client()[method](path).set("Cookie", sessionCookie(staffFixture().id)).send(body)).status).toBe(400);
    expect(service.mutateStaff).not.toHaveBeenCalled(); expect(service.createReceptionist).not.toHaveBeenCalled();
  });
  it.each(["/api/staff?limit=101", "/api/staff?role=OWNER", "/api/staff/audit?targetId=invalid", "/api/staff/invalid"])("rejects malformed read query %s", async (path) => {
    expect((await client().get(path).set("Cookie", sessionCookie(staffFixture().id))).status).toBe(400);
  });
  it("normalizes profile fields and attributes mutations only to authenticated staff", async () => {
    const response = await client().patch(`/api/staff/${targetId}/profile`).set("Cookie", sessionCookie(staffFixture().id)).send({ ...profile, fullName: " Edited Staff ", email: " EDITED@EXAMPLE.TEST " });
    expect(response.status).toBe(200);
    expect(service.mutateStaff).toHaveBeenCalledWith(expect.objectContaining({ id: staffFixture().id, role: "ADMIN" }), targetId, 0, { kind: "profile", fullName: "Edited Staff", email: "edited@example.test" });
  });
  it("does not expose deletion, audit editing or role-demotion endpoints", async () => {
    const instance = client();
    for (const path of [`/api/staff/${targetId}`, "/api/staff/audit/event"]) expect((await instance.delete(path).set("Cookie", sessionCookie(staffFixture().id))).status).toBe(404);
    expect((await instance.patch(`/api/staff/${targetId}/role`).set("Cookie", sessionCookie(staffFixture().id)).send({ role: "RECEPTIONIST" })).status).toBe(404);
    expect(service.mutateStaff).not.toHaveBeenCalled();
  });
});
