import express from "express";
import cookieParser from "cookie-parser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { retailRouter } from "../src/modules/retail/retail.routes.js";
import * as reads from "../src/modules/retail/retail.reads.js";
import * as service from "../src/modules/retail/retail.service.js";
import { Staff } from "../src/modules/auth/staff.model.js";
import type { Permission } from "../src/modules/auth/permissions.js";
import { errorHandler } from "../src/middlewares/error.middleware.js";
import { sessionCookie, staffFixture } from "./helpers/staff.js";
import { testClient } from "./helpers/http.js";
vi.mock("../src/modules/retail/retail.reads.js", () => ({ getProduct: vi.fn(), getSale: vi.fn(), listMovements: vi.fn(), listProducts: vi.fn(), listSales: vi.fn(), retailDashboard: vi.fn() }));
vi.mock("../src/modules/retail/retail.service.js", () => ({ checkout: vi.fn(), changeStock: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn() }));
const id = "000000000000000000000200", base = `/api/retail/products/${id}`;
const profile = { name: "Example drink", sku: "DEMO-001", barcode: "12345", category: "BEVERAGES", sellingPriceLkr: 500, lowStockThreshold: 5, isActive: true };
const purchase = { requestId: "11111111-1111-4111-8111-111111111111", items: [{ productId: id, quantity: 1, expectedUnitPriceLkr: 500 }], expectedTotalLkr: 500, method: "CASH", cashTenderedLkr: 1000 };
function client() { const app = express(); app.use(express.json(), cookieParser()); app.use("/api/retail", retailRouter); app.use(errorHandler); return testClient(app); }
function authenticate(role: "ADMIN" | "RECEPTIONIST", permissions?: Permission[]) { const staff = staffFixture(role, permissions === undefined ? {} : { permissions }); vi.spyOn(Staff, "findById").mockResolvedValue(staff); return sessionCookie(staff.id); }
beforeEach(() => {
  Object.values(reads).forEach(fn => vi.mocked(fn).mockResolvedValue({ data: [] } as never));
  Object.values(service).forEach(fn => vi.mocked(fn).mockResolvedValue({ replayed: false } as never));
});
describe.each([
  ["get", "/api/retail/products", {}], ["get", base, {}], ["get", `${base}/movements`, {}], ["get", "/api/retail/sales", {}], ["get", `/api/retail/sales/${id}`, {}], ["get", "/api/retail/dashboard", {}],
  ["post", "/api/retail/products", { ...profile, initialStock: 10 }], ["put", base, { ...profile, version: 1 }], ["post", `${base}/stock`, { requestId: purchase.requestId, kind: "RESTOCK", change: 10, reason: "Example delivery", version: 1 }], ["post", "/api/retail/checkout", purchase],
] as const)("retail authentication %s %s", (method, path, body) => {
  it("blocks unauthenticated access before any service", async () => {
    expect((await client()[method](path).send(body)).status).toBe(401); [...Object.values(reads), ...Object.values(service)].forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("allows Admin through real auth guards with role-based full access", async () => {
    expect([200, 201]).toContain((await client()[method](path).set("Cookie", authenticate("ADMIN", [])).send(body)).status);
  });
});
describe.each([
  ["post", "/api/retail/products", { ...profile, initialStock: 10 }], ["put", base, { ...profile, version: 1 }], ["post", `${base}/stock`, { requestId: purchase.requestId, kind: "RESTOCK", change: 10, reason: "Example delivery", version: 1 }], ["get", `${base}/movements`, {}], ["get", "/api/retail/dashboard", {}],
] as const)("Admin retail enforcement %s %s", (method, path, body) => {
  it("rejects Receptionists even when Admin management is forged", async () => {
    expect((await client()[method](path).set("Cookie", authenticate("RECEPTIONIST", ["retail.read", "retail.checkout", "retail.sales.read", "retail.manage"])).send(body)).status).toBe(403);
    [...Object.values(reads), ...Object.values(service)].forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
});
describe("retail checkout permission and input boundaries", () => {
  it("supports default Receptionist checkout and derives cashier from authenticated staff", async () => {
    expect((await client().post("/api/retail/checkout").set("Cookie", authenticate("RECEPTIONIST")).send(purchase)).status).toBe(201);
    expect(service.checkout).toHaveBeenCalledWith(expect.objectContaining({ id: staffFixture("RECEPTIONIST").id, role: "RECEPTIONIST" }), expect.objectContaining(purchase));
  });
  it.each<Permission[]>([[], ["retail.read"], ["retail.checkout"]])("requires both read and checkout grants (%j)", async (...permissions) => {
    expect((await client().post("/api/retail/checkout").set("Cookie", authenticate("RECEPTIONIST", permissions)).send(purchase)).status).toBe(403); expect(service.checkout).not.toHaveBeenCalled();
  });
  it("keeps own-history authorization separate from checkout", async () => {
    expect((await client().get("/api/retail/sales").set("Cookie", authenticate("RECEPTIONIST", ["retail.checkout", "retail.read"]))).status).toBe(403);
    expect((await client().get("/api/retail/sales").set("Cookie", authenticate("RECEPTIONIST", ["retail.sales.read"]))).status).toBe(200);
    expect(reads.listSales).toHaveBeenCalledWith(expect.objectContaining({ id: staffFixture("RECEPTIONIST").id }), expect.any(Object));
  });
  it.each([{ date: "2020-01-01" }, { amountLkr: 1 }, { cashier: id }, { lines: [] }, { discount: 50 }, { expectedTotalLkr: 1.5 }, { items: [{ ...purchase.items[0], quantity: -1 }] }, { method: "SPLIT" }, { cashTenderedLkr: null }])("rejects malformed or forged checkout %j", async fields => {
    expect((await client().post("/api/retail/checkout").set("Cookie", authenticate("ADMIN")).send({ ...purchase, ...fields })).status).toBe(400); expect(service.checkout).not.toHaveBeenCalled();
  });
  it("returns a safe 200 for an exact idempotent replay", async () => {
    vi.mocked(service.checkout).mockResolvedValue({ replayed: true } as never);
    expect((await client().post("/api/retail/checkout").set("Cookie", authenticate("RECEPTIONIST")).send(purchase)).status).toBe(200);
  });
  it.each([`${base}/movements?limit=1000`, "/api/retail/products/bad-id", "/api/retail/products?status=unknown", "/api/retail/sales?cashier=forged"]) ("rejects unbounded/forged read parameters %s", async path => {
    expect((await client().get(path).set("Cookie", authenticate("ADMIN"))).status).toBe(400); Object.values(reads).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
  it("exposes no sale deletion/update or raw stock update endpoint", async () => {
    const cookie = authenticate("ADMIN");
    expect((await client().delete(`/api/retail/sales/${id}`).set("Cookie", cookie))).toHaveProperty("status", 404);
    expect((await client().put(`/api/retail/sales/${id}`).set("Cookie", cookie).send({ amountLkr: 1 }))).toHaveProperty("status", 404);
    expect((await client().put(base).set("Cookie", cookie).send({ ...profile, version: 1, stock: 1000 }))).toHaveProperty("status", 400);
  });
});
