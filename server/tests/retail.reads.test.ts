import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RetailProduct, RetailSale, StockMovement } from "../src/modules/retail/retail.model.js";
import { getProduct, getSale, listMovements, listProducts, listSales, retailDashboard } from "../src/modules/retail/retail.reads.js";
import type { RetailActor } from "../src/modules/retail/retail.service.js";
import { productQuery, saleQuery } from "../src/modules/retail/retail.validation.js";
const id = "000000000000000000000200", actor: RetailActor = { id: "000000000000000000000002", fullName: "Example", role: "RECEPTIONIST", permissions: ["retail.read", "retail.sales.read"] }, admin: RetailActor = { ...actor, role: "ADMIN" };
const query = (value: unknown) => ({ sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) });
const product = () => RetailProduct.hydrate({ _id: id, name: "Example drink", sku: "DRINK-001", category: "BEVERAGES", sellingPriceLkr: 500, stock: 3, lowStockThreshold: 4, supplierName: "Private supplier", supplierContact: "Private contact", isActive: true, version: 2 });
const sale = () => RetailSale.hydrate({ _id: id, saleNumber: "WF-POS-EXAMPLE", requestId: "internal", fingerprint: "private-fingerprint", lines: [{ product: id, name: "Original product name", sku: "ORIGINAL-SKU", quantity: 2, unitPriceLkr: 500, lineTotalLkr: 1000 }], amountLkr: 1000, method: "CASH", cashTenderedLkr: 1500, changeLkr: 500, cashier: actor.id, cashierName: "Example", soldAt: new Date("2026-01-15T19:00:00Z"), date: "2026-01-16" });
beforeEach(() => { vi.setSystemTime(new Date("2026-01-15T19:00:00Z")); });
describe("authorized retail reads and reporting", () => {
  it("escapes catalog search literally, applies stock filters and returns bounded pages", async () => {
    const chain = query([product()]); vi.spyOn(RetailProduct, "find").mockReturnValue(chain as never); vi.spyOn(RetailProduct, "countDocuments").mockResolvedValue(13);
    const result = await listProducts(actor, productQuery.parse({ q: "drink.*", stock: "low", page: 2 }));
    expect(RetailProduct.find).toHaveBeenCalledWith({ isActive: true, stock: { $gt: 0 }, $expr: { $lte: ["$stock", "$lowStockThreshold"] }, $or: expect.arrayContaining([{ name: { $regex: "drink\\.\\*", $options: "i" } }]) });
    expect(chain.skip).toHaveBeenCalledWith(12); expect(result.pagination).toEqual({ page: 2, limit: 12, total: 13, totalPages: 2 }); expect(result.data[0]).not.toHaveProperty("supplierContact");
  });
  it("uses exact barcode equality and never exposes inactive products to Receptionists", async () => {
    vi.spyOn(RetailProduct, "find").mockReturnValue(query([]) as never); vi.spyOn(RetailProduct, "countDocuments").mockResolvedValue(0);
    await listProducts(actor, productQuery.parse({ barcode: "12345" })); expect(RetailProduct.find).toHaveBeenCalledWith({ isActive: true, barcode: "12345" });
    await expect(listProducts(actor, productQuery.parse({ status: "all" }))).rejects.toHaveProperty("statusCode", 403);
  });
  it("limits Receptionist profiles to active products with no supplier fields", async () => {
    vi.spyOn(RetailProduct, "findOne").mockResolvedValue(product()); expect((await getProduct(actor, id)).product).not.toHaveProperty("supplierName");
    expect(RetailProduct.findOne).toHaveBeenCalledWith({ _id: id, isActive: true });
    vi.mocked(RetailProduct.findOne).mockResolvedValue(null); await expect(getProduct(actor, id)).rejects.toHaveProperty("statusCode", 404);
  });
  it("scopes Receptionist history on the server to their cashier ID", async () => {
    vi.spyOn(RetailSale, "find").mockReturnValue(query([sale()]) as never); vi.spyOn(RetailSale, "countDocuments").mockResolvedValue(1);
    const result = await listSales(actor, saleQuery.parse({ from: "2026-01-15", to: "2026-01-16", method: "CASH", q: "Original.*" }));
    expect(RetailSale.find).toHaveBeenCalledWith(expect.objectContaining({ cashier: new mongoose.Types.ObjectId(actor.id), method: "CASH", date: { $gte: "2026-01-15", $lte: "2026-01-16" }, $or: expect.arrayContaining([{ "lines.name": { $regex: "Original\\.\\*", $options: "i" } }]) }));
    expect(result.scope).toBe("OWN"); expect(JSON.stringify(result.data)).not.toMatch(/fingerprint|requestId/);
  });
  it("cannot retrieve another cashier's sale by guessing its receipt ID", async () => {
    vi.spyOn(RetailSale, "findOne").mockResolvedValue(null); await expect(getSale(actor, id)).rejects.toHaveProperty("statusCode", 404);
    expect(RetailSale.findOne).toHaveBeenCalledWith({ _id: id, cashier: actor.id });
  });
  it("allows Admin receipts without a cashier restriction and preserves stored line prices", async () => {
    vi.spyOn(RetailSale, "findOne").mockResolvedValue(sale());
    expect((await getSale(admin, id)).sale.lines[0]).toMatchObject({ name: "Original product name", unitPriceLkr: 500, lineTotalLkr: 1000 });
    expect(RetailSale.findOne).toHaveBeenCalledWith({ _id: id });
  });
  it("provides Admin movement history with actor, reason and before/after quantities", async () => {
    const record = StockMovement.hydrate({ _id: id, product: id, productName: "Example drink", sku: "DRINK-001", kind: "ADJUSTMENT", change: -2, before: 5, after: 3, actor: admin.id, actorName: "Example Admin", reason: "Fictional damaged stock", recordedAt: new Date("2026-01-16T01:00:00Z") });
    vi.spyOn(StockMovement, "find").mockReturnValue(query([record]) as never); vi.spyOn(StockMovement, "countDocuments").mockResolvedValue(1);
    expect((await listMovements(admin, id, { page: 1, limit: 10 })).data[0]).toMatchObject({ before: 5, after: 3, change: -2, actorName: "Example Admin" });
  });
  it.each(["dashboard", "movements"])("denies %s for Receptionists regardless of a forged manage grant", async kind => {
    const forged = { ...actor, permissions: ["retail.manage"] as RetailActor["permissions"] };
    if (kind === "dashboard") await expect(retailDashboard(forged, {})).rejects.toHaveProperty("statusCode", 403);
    else await expect(listMovements(forged, id, { page: 1, limit: 10 })).rejects.toHaveProperty("statusCode", 403);
  });
  it("preserves deny-all for catalog, sales history and receipts", async () => {
    const denied = { ...actor, permissions: [] };
    await expect(listProducts(denied, productQuery.parse({}))).rejects.toHaveProperty("statusCode", 403);
    await expect(listSales(denied, saleQuery.parse({}))).rejects.toHaveProperty("statusCode", 403);
    await expect(getSale(denied, id)).rejects.toHaveProperty("statusCode", 403);
  });
  it("keeps today's sales independent of the selected period and fills only successful empty days", async () => {
    vi.spyOn(RetailSale, "aggregate").mockResolvedValueOnce([{ overall: [{ amountLkr: 1000, count: 1, units: 2 }], methods: [{ _id: "CASH", amountLkr: 1000, count: 1 }], days: [{ _id: "2026-01-10", amountLkr: 1000 }], best: [{ _id: id, name: "Example drink", sku: "DRINK-001", quantity: 2, amountLkr: 1000 }], recent: [sale()] }]).mockResolvedValueOnce([{ amountLkr: 5000, count: 4, units: 10 }]);
    vi.spyOn(RetailProduct, "aggregate").mockResolvedValue([{ summary: [{ count: 1, low: 1, out: 0 }], low: [product()], out: [] }]);
    const result = await retailDashboard(admin, { from: "2026-01-10", to: "2026-01-11" });
    expect(result.today).toMatchObject({ date: "2026-01-16", amountLkr: 5000 }); expect(result.summary.amountLkr).toBe(1000);
    expect(result.trend).toEqual([{ date: "2026-01-10", value: 1000 }, { date: "2026-01-11", value: 0 }]); expect(result.stock.lowStockCount).toBe(1); expect(result.bestSelling[0].quantity).toBe(2);
  });
  it("returns successful empty reporting without fake recent transactions", async () => {
    vi.spyOn(RetailSale, "aggregate").mockResolvedValue([]); vi.spyOn(RetailProduct, "aggregate").mockResolvedValue([]);
    const result = await retailDashboard(admin, { from: "2026-01-16", to: "2026-01-16" });
    expect(result.summary).toEqual({ amountLkr: 0, count: 0, units: 0 }); expect(result.recent).toEqual([]); expect(result.bestSelling).toEqual([]);
  });
  it("propagates report failures instead of inventing zero collections", async () => {
    vi.spyOn(RetailSale, "aggregate").mockRejectedValue(new Error("Fictional unavailable ledger")); vi.spyOn(RetailProduct, "aggregate").mockResolvedValue([]);
    await expect(retailDashboard(admin, {})).rejects.toThrow("unavailable ledger");
  });
  it("rejects invalid periods before database access", async () => {
    await expect(retailDashboard(admin, { from: "2026-01-16", to: "2026-01-10" })).rejects.toHaveProperty("statusCode", 400);
  });
});
