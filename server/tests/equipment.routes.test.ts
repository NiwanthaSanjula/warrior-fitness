import express from "express";
import cookieParser from "cookie-parser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { equipmentRouter } from "../src/modules/equipment/equipment.routes.js";
import * as reads from "../src/modules/equipment/equipment.service.js";
import * as writes from "../src/modules/equipment/equipment.mutations.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import type { Permission } from "../src/modules/auth/permissions.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";
import { testClient } from "./helpers/http.js";
vi.mock("../src/modules/equipment/equipment.service.js", () => ({ equipmentHistory: vi.fn(), getEquipment: vi.fn(), listEquipment: vi.fn(), listIncidents: vi.fn(), listWorkOrders: vi.fn(), maintenanceDashboard: vi.fn() }));
vi.mock("../src/modules/equipment/equipment.mutations.js", () => ({ assignWork: vi.fn(), createEquipment: vi.fn(), createWork: vi.fn(), linkExpense: vi.fn(), reportIncident: vi.fn(), reviewIncident: vi.fn(), setEquipmentStatus: vi.fn(), transitionWork: vi.fn(), updateEquipment: vi.fn() }));
const id = "000000000000000000000100", other = "000000000000000000000101", base = `/api/equipment/${id}`;
function client() { const app = express(); app.use(express.json(), cookieParser()); app.use("/api/equipment", equipmentRouter); app.use(errorHandler); return testClient(app); }
function authenticate(role: "ADMIN" | "RECEPTIONIST", permissions?: Permission[]) { const staff = staffFixture(role, permissions === undefined ? {} : { permissions }); vi.spyOn(Staff, "findById").mockResolvedValue(staff); return sessionCookie(staff.id); }
beforeEach(() => {
  Object.values(reads).forEach(fn => vi.mocked(fn).mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } } as never));
  Object.values(writes).forEach(fn => vi.mocked(fn).mockResolvedValue({ equipment: { id } } as never));
});
const profile = { assetId: "EXAMPLE-100", name: "Example treadmill", category: "CARDIO", location: "Main room" };
describe.each([
  ["post", "/api/equipment", profile], ["put", base, { ...profile, assetId: undefined, version: 0 }],
  ["patch", `${base}/status`, { status: "OUT_OF_SERVICE", reason: "Inspection needed", version: 0 }],
  ["patch", `${base}/incidents/${other}`, { action: "ACKNOWLEDGE", notes: "Technician assigned", version: 0 }],
  ["post", `${base}/work-orders`, { title: "Inspect running belt", kind: "REPAIR", plannedDate: "2026-01-15", version: 0 }],
  ["patch", `${base}/work-orders/${other}/assignment`, { technician: "Example Technician", version: 0 }],
  ["post", `${base}/work-orders/${other}/transition`, { action: "START", version: 0 }],
  ["post", `${base}/work-orders/${other}/expenses`, { expenseId: other, version: 0 }],
  ["get", "/api/equipment/maintenance", {}], ["get", "/api/equipment/work-orders", {}], ["get", "/api/equipment/incidents", {}],
] as const)("Admin equipment authorization %s %s", (method, path, body) => {
  it("rejects unauthenticated requests before services", async () => {
    expect((await client()[method](path).send(body)).status).toBe(401);
    [...Object.values(reads), ...Object.values(writes)].forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("rejects Receptionists even with forged maintenance and Finance grants", async () => {
    expect((await client()[method](path).set("Cookie", authenticate("RECEPTIONIST", ["equipment.read", "equipment.report", "equipment.manage", "expenses.manage"])).send(body)).status).toBe(403);
    [...Object.values(reads), ...Object.values(writes)].forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("accepts Admin through the real auth/role guards", async () => {
    expect([200, 201]).toContain((await client()[method](path).set("Cookie", authenticate("ADMIN", [])).send(body)).status);
  });
});
describe("Receptionist equipment access and validation", () => {
  it.each(["/api/equipment", base, `${base}/history?kind=incidents`])("allows legacy default Receptionist reads %s", async path => {
    expect((await client().get(path).set("Cookie", authenticate("RECEPTIONIST"))).status).toBe(200);
  });
  it("attributes faults to the authenticated staff instead of trusting request fields", async () => {
    const input = { description: "Fictional equipment fault", severity: "HIGH", requestId: "11111111-1111-4111-8111-111111111111", version: 0 };
    const response = await client().post(`${base}/incidents`).set("Cookie", authenticate("RECEPTIONIST")).send(input);
    expect(response.status).toBe(201);
    expect(writes.reportIncident).toHaveBeenCalledWith(expect.objectContaining({ role: "RECEPTIONIST", id: staffFixture("RECEPTIONIST").id }), id, input);
  });
  it.each<Permission[]>([[], ["equipment.read"], ["equipment.report"]])("requires both read and report for faults (%j)", async (...permissions) => {
    expect((await client().post(`${base}/incidents`).set("Cookie", authenticate("RECEPTIONIST", permissions)).send({})).status).toBe(403);
    expect(writes.reportIncident).not.toHaveBeenCalled();
  });
  it("preserves explicit deny-all for inventory/profile/history", async () => {
    const cookie = authenticate("RECEPTIONIST", []);
    for (const path of ["/api/equipment", base, `${base}/history?kind=incidents`]) expect((await client().get(path).set("Cookie", cookie)).status).toBe(403);
  });
  it.each([
    ["post", "/api/equipment", { ...profile, purchasePriceLkr: 1.5 }],
    ["post", "/api/equipment", { ...profile, status: "RETIRED" }],
    ["put", base, { ...profile, assetId: "REWRITE", version: 0 }],
    ["post", `${base}/incidents`, { requestId: "bad", description: "Invalid", severity: "HIGH", version: 0 }],
    ["post", `${base}/incidents`, { requestId: "11111111-1111-4111-8111-111111111111", description: "Fictional problem", severity: "HIGH", version: 0, reportedBy: other }],
    ["get", "/api/equipment?limit=1000", {}], ["get", "/api/equipment/bad-id", {}],
  ] as const)("rejects malformed or injected requests %s %s", async (method, path, body) => {
    expect((await client()[method](path).set("Cookie", authenticate("ADMIN")).send(body)).status).toBe(400);
    Object.values(writes).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("offers no destructive equipment/history endpoints", async () => {
    expect((await client().delete(base).set("Cookie", authenticate("ADMIN"))).status).toBe(404);
  });
});
