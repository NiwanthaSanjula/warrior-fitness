import express from "express";
import cookieParser from "cookie-parser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Staff } from "../src/modules/auth/staff.model.js";
import { notificationRouter } from "../src/modules/notifications/notification.routes.js";
import * as service from "../src/modules/notifications/notification.service.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";
import { testClient } from "./helpers/http.js";

vi.mock("../src/modules/notifications/notification.service.js", () => ({ getNotificationOverview: vi.fn(), getConsent: vi.fn(), saveConsent: vi.fn(), simulateDueReminders: vi.fn() }));
const memberId = "000000000000000000000010";
function client() { const app = express(); app.use(express.json(), cookieParser()); app.use("/api/notifications", notificationRouter); app.use(errorHandler); return testClient(app); }
beforeEach(() => {
  vi.mocked(service.getNotificationOverview).mockResolvedValue({ success: true } as never);
  vi.mocked(service.getConsent).mockResolvedValue({ success: true } as never);
  vi.mocked(service.saveConsent).mockResolvedValue({ success: true } as never);
  vi.mocked(service.simulateDueReminders).mockResolvedValue({ due: 0, simulated: 0, duplicates: 0, skipped: 0, realMessagesSent: 0, deliveryMode: "SIMULATION_ONLY" });
});
describe.each([
  ["get", "/api/notifications/overview", {}], ["get", `/api/notifications/consent/${memberId}`, {}],
  ["put", "/api/notifications/consent", { memberId, whatsappOptIn: true, confirmedOptIn: true }], ["post", "/api/notifications/simulate-due", {}],
] as const)("notification authorization %s %s", (method, path, body) => {
  it("denies unauthenticated requests before service execution", async () => {
    expect((await client()[method](path).send(body)).status).toBe(401);
    Object.values(service).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("denies Receptionists regardless of forged Admin permissions", async () => {
    const staff = staffFixture("RECEPTIONIST", { permissions: ["settings.manage"] }); vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    expect((await client()[method](path).set("Cookie", sessionCookie(staff.id)).send(body)).status).toBe(403);
    Object.values(service).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("allows active Admin through real guards even with an empty permission override", async () => {
    const staff = staffFixture("ADMIN", { permissions: [] }); vi.spyOn(Staff, "findById").mockResolvedValue(staff);
    expect((await client()[method](path).set("Cookie", sessionCookie(staff.id)).send(body)).status).toBe(200);
  });
});
describe("notification validation and authenticated attribution", () => {
  beforeEach(() => vi.spyOn(Staff, "findById").mockResolvedValue(staffFixture("ADMIN")));
  it.each([
    { memberId, whatsappOptIn: true }, { memberId, whatsappOptIn: true, confirmedOptIn: false },
    { memberId, whatsappOptIn: "true" }, { memberId: "bad", whatsappOptIn: false },
    { memberId, whatsappOptIn: false, updatedBy: "forged" }, { memberId, whatsappOptIn: false, recipient: "forged" },
  ])("rejects invalid consent input %j", async body => {
    expect((await client().put("/api/notifications/consent").set("Cookie", sessionCookie(staffFixture().id)).send(body)).status).toBe(400);
    expect(service.saveConsent).not.toHaveBeenCalled();
  });
  it("records only explicit consent and attributes it to authenticated Admin", async () => {
    const response = await client().put("/api/notifications/consent").set("Cookie", sessionCookie(staffFixture().id)).send({ memberId, whatsappOptIn: true, confirmedOptIn: true });
    expect(response.status).toBe(200); expect(service.saveConsent).toHaveBeenCalledWith(memberId, true, staffFixture().id);
  });
  it("allows revocation without opt-in proof", async () => {
    expect((await client().put("/api/notifications/consent").set("Cookie", sessionCookie(staffFixture().id)).send({ memberId, whatsappOptIn: false })).status).toBe(200);
    expect(service.saveConsent).toHaveBeenCalledWith(memberId, false, staffFixture().id);
  });
  it.each([{ realDelivery: true }, { recipient: "+94770000000" }, { scheduledDate: "2030-01-01" }, { deliveryMode: "LIVE" }])("rejects simulation overrides %j", async body => {
    expect((await client().post("/api/notifications/simulate-due").set("Cookie", sessionCookie(staffFixture().id)).send(body)).status).toBe(400);
    expect(service.simulateDueReminders).not.toHaveBeenCalled();
  });
  it("rejects malformed member IDs", async () => {
    expect((await client().get("/api/notifications/consent/invalid").set("Cookie", sessionCookie(staffFixture().id))).status).toBe(400);
    expect(service.getConsent).not.toHaveBeenCalled();
  });
});
