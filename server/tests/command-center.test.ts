import express from "express";
import cookieParser from "cookie-parser";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { equipmentRouter } from "../src/modules/equipment/equipment.routes.js";
import { notificationRouter } from "../src/modules/notifications/notification.routes.js";
import { getEquipmentAlerts } from "../src/modules/equipment/equipment.alerts.js";
import { Equipment, EquipmentIncident } from "../src/modules/equipment/equipment.model.js";
import { getAutomaticScheduleStatus } from "../src/modules/notifications/notification.scheduler-status.js";
import * as notifications from "../src/modules/notifications/notification.service.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";
import { testClient } from "./helpers/http.js";

vi.mock("../src/modules/notifications/notification.scheduler-status.js", () => ({ getAutomaticScheduleStatus: vi.fn() }));
vi.mock("../src/modules/notifications/notification.service.js", () => ({ getNotificationOverview: vi.fn(), getConsent: vi.fn(), saveConsent: vi.fn(), simulateDueReminders: vi.fn() }));
const scheduler = { enabled: false, timeZone: "Asia/Colombo", dailyTime: "09:00", nextRunAt: null, deliveryMode: "SIMULATION_ONLY", historyAvailable: false, lastRun: null };
function client() {
  const app = express(); app.use(cookieParser());
  app.use("/api/equipment", equipmentRouter); app.use("/api/notifications", notificationRouter); app.use(errorHandler);
  return testClient(app);
}
function authenticate(role: "ADMIN" | "RECEPTIONIST") {
  const staff = staffFixture(role, { permissions: ["equipment.manage", "settings.manage"] });
  vi.spyOn(Staff, "findById").mockResolvedValue(staff); return sessionCookie(staff.id);
}
beforeEach(() => {
  vi.spyOn(EquipmentIncident, "aggregate").mockResolvedValue([]);
  vi.mocked(getAutomaticScheduleStatus).mockResolvedValue(scheduler as never);
});

describe.each(["/api/equipment/alerts", "/api/notifications/automation-status"])("command center authorization %s", path => {
  it("requires authentication before reading operational data", async () => {
    expect((await client().get(path)).status).toBe(401);
    expect(EquipmentIncident.aggregate).not.toHaveBeenCalled(); expect(getAutomaticScheduleStatus).not.toHaveBeenCalled();
  });
  it("rejects Receptionists including forged Admin grants", async () => {
    expect((await client().get(path).set("Cookie", authenticate("RECEPTIONIST"))).status).toBe(403);
    expect(EquipmentIncident.aggregate).not.toHaveBeenCalled(); expect(getAutomaticScheduleStatus).not.toHaveBeenCalled();
  });
  it("allows Admin through the real session, role and permission guards", async () => {
    expect((await client().get(path).set("Cookie", authenticate("ADMIN"))).status).toBe(200);
  });
});

describe("read-only command center sources", () => {
  it("returns scheduler status without eligibility, consent, message bodies or simulation execution", async () => {
    const response = await client().get("/api/notifications/automation-status").set("Cookie", authenticate("ADMIN"));
    expect(response.body).toEqual({ success: true, scheduler });
    expect(getAutomaticScheduleStatus).toHaveBeenCalledOnce();
    Object.values(notifications).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("propagates a status-source failure as an error instead of a false healthy response", async () => {
    vi.mocked(getAutomaticScheduleStatus).mockRejectedValue(new Error("Fictional storage failure"));
    expect((await client().get("/api/notifications/automation-status").set("Cookie", authenticate("ADMIN"))).status).toBe(500);
    expect(notifications.simulateDueReminders).not.toHaveBeenCalled();
  });
  it("queries only unresolved faults with bounded severity/oldest ordering and a minimal asset join", async () => {
    await getEquipmentAlerts({ id: staffFixture().id, fullName: "Example Admin", role: "ADMIN", permissions: [] });
    const pipeline = vi.mocked(EquipmentIncident.aggregate).mock.calls[0][0];
    expect(pipeline).toEqual(expect.arrayContaining([
      { $match: { status: { $in: ["OPEN", "ACKNOWLEDGED"] } } },
      { $sort: { priority: 1, reportedAt: 1, _id: 1 } }, { $limit: 5 },
      { $lookup: { from: Equipment.collection.name, localField: "equipment", foreignField: "_id", as: "asset", pipeline: [{ $project: { name: 1, assetId: 1 } }] } },
    ]));
    const priority = JSON.stringify(pipeline?.[1]);
    expect(priority).toContain('"CRITICAL"'); expect(priority).toContain('"HIGH"'); expect(priority).toContain('"MEDIUM"');
    expect(priority).toContain('"default":3');
    expect(pipeline?.findIndex(stage => "$limit" in stage)).toBeLessThan(pipeline?.findIndex(stage => "$lookup" in stage) ?? 0);
  });
  it("maps only the public alert fields and tolerates a missing equipment profile", async () => {
    const id = new Types.ObjectId(), equipment = new Types.ObjectId(), reportedAt = new Date("2026-11-01T03:00:00Z");
    const common = { _id: id, equipment, description: "Fictional safety problem", severity: "CRITICAL", status: "OPEN", reportedAt, reviewNotes: "Private instructions", reporter: "Private staff field" };
    vi.mocked(EquipmentIncident.aggregate).mockResolvedValue([{ ...common, asset: { name: "Example treadmill", assetId: "EXAMPLE-1", purchasePriceLkr: 99999 } }, common]);
    const result = await getEquipmentAlerts({ id: staffFixture().id, fullName: "Example Admin", role: "ADMIN", permissions: [] });
    expect(result.data[0]).toEqual({ id: String(id), equipmentId: String(equipment), equipmentName: "Example treadmill", assetId: "EXAMPLE-1", description: common.description, severity: "CRITICAL", status: "OPEN", reportedAt: reportedAt.toISOString() });
    expect(result.data[1]).toMatchObject({ equipmentName: "Equipment unavailable", assetId: null });
  });
  it("enforces Admin access when called directly, before any aggregation", async () => {
    await expect(getEquipmentAlerts({ id: staffFixture().id, fullName: "Example Admin", role: "RECEPTIONIST", permissions: ["equipment.manage"] })).rejects.toMatchObject({ statusCode: 403 });
    expect(EquipmentIncident.aggregate).not.toHaveBeenCalled();
  });
  it("does not mask a failed fault read as an empty queue", async () => {
    vi.mocked(EquipmentIncident.aggregate).mockRejectedValue(new Error("Fictional query failure"));
    expect((await client().get("/api/equipment/alerts").set("Cookie", authenticate("ADMIN"))).status).toBe(500);
  });
});
