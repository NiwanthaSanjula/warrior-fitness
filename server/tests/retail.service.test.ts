import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RetailProduct, RetailSale, StockMovement, type IRetailProduct } from "../src/modules/retail/retail.model.js";
import { FinancialDay } from "../src/modules/financial/financial-day.model.js";
import { Member } from "../src/modules/members/member.model.js";
import { changeStock, checkout, createProduct, publicProduct, saleAmounts, updateProduct, type RetailActor } from "../src/modules/retail/retail.service.js";
import { checkoutInput, createProductInput, productQuery, stockInput, updateProductInput } from "../src/modules/retail/retail.validation.js";
import { effectivePermissions } from "../src/modules/auth/permissions.js";
const id = "000000000000000000000200", other = "000000000000000000000201", memberId = "000000000000000000000202";
const admin: RetailActor = { id: "000000000000000000000001", fullName: "Example Admin", role: "ADMIN", permissions: [] };
const receptionist: RetailActor = { ...admin, id: "000000000000000000000002", fullName: "Example Receptionist", role: "RECEPTIONIST", permissions: ["retail.read", "retail.checkout", "retail.sales.read"] };
const session = {} as ClientSession, sessionValue = (value: unknown) => ({ session: vi.fn().mockResolvedValue(value) }) as never;
const profile = () => createProductInput.parse({ name: "Fictional drink", sku: "DRINK-001", barcode: "1234567890123", category: "BEVERAGES", sellingPriceLkr: 500, lowStockThreshold: 3, supplierName: "Example Supplier", supplierContact: "Private contact", isActive: true, initialStock: 10 });
const fixture = (fields: Partial<IRetailProduct> = {}) => RetailProduct.hydrate({ _id: id, ...profile(), initialStock: undefined, stock: 10, version: 2, createdBy: admin.id, ...fields });
const input = () => checkoutInput.parse({ requestId: "11111111-1111-4111-8111-111111111111", items: [{ productId: id, quantity: 2, expectedUnitPriceLkr: 500 }], expectedTotalLkr: 1000, method: "CASH", cashTenderedLkr: 1500 });
const stockRequest = () => stockInput.parse({ requestId: "22222222-2222-4222-8222-222222222222", kind: "RESTOCK", change: 5, reason: "Fictional supplier delivery", version: 2 });
const saved: mongoose.Document[] = [];
let product: HydratedDocument<IRetailProduct>, failSave: string;
beforeEach(() => {
  vi.setSystemTime(new Date("2026-01-15T19:00:00Z")); product = fixture(); saved.length = 0; failSave = "";
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async callback => callback(session));
  vi.spyOn(RetailProduct, "exists").mockReturnValue(sessionValue(null));
  vi.spyOn(RetailProduct, "findById").mockReturnValue(sessionValue(product));
  vi.spyOn(RetailProduct, "findOneAndUpdate").mockResolvedValue(fixture({ stock: 8, version: 3 }));
  vi.spyOn(RetailSale, "findOne").mockReturnValue(sessionValue(null));
  vi.spyOn(StockMovement, "findOne").mockReturnValue(sessionValue(null));
  vi.spyOn(FinancialDay, "findOneAndUpdate").mockResolvedValue(new FinancialDay({ _id: "2026-01-16", revision: 1, closed: false }));
  vi.spyOn(Member, "findById").mockReturnValue(sessionValue(Member.hydrate({ _id: memberId, fullName: "Fictional Member", memberId: "WF-DEMO-ONLY", isActive: true })));
  vi.spyOn(mongoose.Model.prototype, "save").mockImplementation(async function(this: mongoose.Document) {
    if (![RetailProduct, StockMovement, RetailSale].some(Model => this instanceof Model)) throw new Error("Unexpected retail test write to another module");
    if ((this.constructor as typeof mongoose.Model).modelName === failSave) throw new Error("Fictional persistence failure");
    saved.push(this); return this;
  });
});
describe("retail validation and safe amounts", () => {
  it("normalizes codes while preserving null barcodes for non-barcoded products", () => {
    expect(createProductInput.parse({ ...profile(), sku: " drink-001 ", barcode: null })).toMatchObject({ sku: "DRINK-001", barcode: null });
    expect(RetailProduct.schema.path("sku").options.unique).toBe(true);
    expect(RetailProduct.schema.indexes()).toContainEqual([{ barcode: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { barcode: { $type: "string" } } })]);
  });
  it.each([{ sellingPriceLkr: 1.5 }, { sellingPriceLkr: 0 }, { sellingPriceLkr: 10000001 }, { initialStock: -1 }, { initialStock: 0.5 }, { lowStockThreshold: -1 }, { sku: "bad/sku" }, { barcode: " " }, { stock: 500 }, { createdBy: admin.id }])("rejects invalid product inputs %j", fields => {
    expect(createProductInput.safeParse({ ...profile(), ...fields }).success).toBe(false);
  });
  it.each([{ amountLkr: 1 }, { date: "2020-01-01" }, { soldAt: "2020-01-01" }, { cashier: admin.id }, { discount: 1 }, { payments: [] }, { cashTenderedLkr: 1.5 }])("rejects client financial/attribution injection %j", fields => {
    expect(checkoutInput.safeParse({ ...input(), ...fields }).success).toBe(false);
  });
  it.each([0, -1, 1.5, 1001])("rejects invalid quantity %s", quantity => expect(checkoutInput.safeParse({ ...input(), items: [{ ...input().items[0], quantity }] }).success).toBe(false));
  it("rejects empty/duplicate cart lines and unbounded queries", () => {
    expect(checkoutInput.safeParse({ ...input(), items: [] }).success).toBe(false);
    expect(checkoutInput.safeParse({ ...input(), items: [input().items[0], input().items[0]] }).success).toBe(false);
    expect(productQuery.safeParse({ limit: 51 }).success).toBe(false);
    expect(productQuery.safeParse({ q: { $ne: "" } }).success).toBe(false);
  });
  it.each([{ kind: "RESTOCK", change: -2 }, { change: 0 }, { reason: " " }, { change: 1.5 }])("requires a valid stock change and reason %j", fields => expect(stockInput.safeParse({ ...stockRequest(), ...fields }).success).toBe(false));
  it("calculates cash change from whole server prices", () => {
    expect(saleAmounts([{ quantity: 2, unitPriceLkr: 500 }, { quantity: 1, unitPriceLkr: 250 }], "CASH", 1500)).toEqual({ amountLkr: 1250, changeLkr: 250 });
    expect(saleAmounts([{ quantity: 2, unitPriceLkr: 500 }], "CARD", null)).toEqual({ amountLkr: 1000, changeLkr: 0 });
  });
  it.each([[0, 500, "CASH", 1500], [0.5, 500, "CASH", 1500], [2, 1.5, "CASH", 1500], [1000, 10000000, "CASH", 1000000000], [2, 500, "CASH", 999], [2, 500, "CARD", 1000]] as const)("rejects unsafe prices/amounts and cash mismatch %s %s %s", (quantity, unitPriceLkr, method, cash) => {
    expect(() => saleAmounts([{ quantity, unitPriceLkr }], method, cash)).toThrow();
  });
  it("adds safe Receptionist defaults without changing custom or deny-all grants", () => {
    expect(effectivePermissions({ role: "RECEPTIONIST" })).toEqual(expect.arrayContaining(["retail.read", "retail.checkout", "retail.sales.read"]));
    expect(effectivePermissions({ role: "RECEPTIONIST", permissions: [] })).toEqual([]);
    expect(effectivePermissions({ role: "RECEPTIONIST", permissions: ["members.read", "retail.manage"] })).toEqual(["members.read"]);
  });
});
describe("catalog and stock management", () => {
  it("registers a product and its opening movement in the same transaction", async () => {
    const result = await createProduct(admin, profile());
    expect(result.product.stock).toBe(10); expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({ kind: "OPENING", before: 0, change: 10, after: 10, actorName: admin.fullName });
    expect(mongoose.Model.prototype.save).toHaveBeenNthCalledWith(1, { session }); expect(mongoose.Model.prototype.save).toHaveBeenNthCalledWith(2, { session });
  });
  it.each(["SKU", "barcode"])("prevents duplicate %s before initial stock is written", async () => {
    vi.mocked(RetailProduct.exists).mockReturnValue(sessionValue({ _id: product._id }));
    await expect(createProduct(admin, profile())).rejects.toHaveProperty("statusCode", 409); expect(saved).toHaveLength(0);
    expect(RetailProduct.exists).toHaveBeenCalledWith({ $or: [{ sku: "DRINK-001" }, { barcode: "1234567890123" }] });
  });
  it("edits metadata using version checks, never accepts raw stock edits", async () => {
    const { initialStock: _initialStock, ...fields } = profile();
    const update = updateProductInput.parse({ ...fields, name: "Updated example drink", version: 2 });
    await updateProduct(admin, id, update);
    expect(RetailProduct.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, version: 2 }, { $set: { ...fields, name: "Updated example drink" }, $inc: { version: 1 } }, { new: true, runValidators: true });
    expect(updateProductInput.safeParse({ ...update, stock: 100 }).success).toBe(false);
    vi.mocked(RetailProduct.findOneAndUpdate).mockResolvedValue(null);
    await expect(updateProduct(admin, id, update)).rejects.toHaveProperty("statusCode", 409);
  });
  it("restocks atomically with before/after quantities, reason and authenticated actor", async () => {
    vi.mocked(RetailProduct.findOneAndUpdate).mockResolvedValue(fixture({ stock: 15, version: 3 }));
    const result = await changeStock(admin, id, stockRequest());
    expect(result.movement).toMatchObject({ before: 10, after: 15, change: 5, reason: stockRequest().reason, actorName: admin.fullName });
    expect(RetailProduct.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, version: 2, stock: 10 }, { $inc: { stock: 5, version: 1 } }, { new: true, runValidators: true, session });
    expect(FinancialDay.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("replays a stock request without adding units again; changed content is rejected", async () => {
    vi.mocked(RetailProduct.findOneAndUpdate).mockResolvedValue(fixture({ stock: 15, version: 3 }));
    const first = await changeStock(admin, id, stockRequest());
    vi.mocked(StockMovement.findOne).mockReturnValue(sessionValue(saved[0]));
    expect((await changeStock(admin, id, stockRequest())).replayed).toBe(true);
    expect(first.movement.change).toBe(5); expect(RetailProduct.findOneAndUpdate).toHaveBeenCalledOnce();
    await expect(changeStock(admin, id, { ...stockRequest(), change: 6 })).rejects.toHaveProperty("statusCode", 409);
  });
  it.each(["negative", "overflow", "stale", "race"])("rejects %s stock corrections without success history", async kind => {
    const request = { ...stockRequest(), kind: "ADJUSTMENT" as const, change: kind === "negative" ? -11 : 1 };
    if (kind === "overflow") product.stock = 10000000;
    if (kind === "stale") request.version = 1;
    if (kind === "race") vi.mocked(RetailProduct.findOneAndUpdate).mockResolvedValue(null);
    await expect(changeStock(admin, id, request)).rejects.toHaveProperty("statusCode", 409); expect(saved).toHaveLength(0);
  });
  it("redacts supplier contact and thresholds from Receptionist catalog data", () => {
    expect(publicProduct(product, admin)).toHaveProperty("supplierContact", "Private contact");
    for (const key of ["supplierContact", "supplierName", "lowStockThreshold"]) expect(publicProduct(product, receptionist)).not.toHaveProperty(key);
  });
  it.each(["create", "edit", "stock"])("denies Receptionist %s even with forged management permission", async kind => {
    const actor = { ...receptionist, permissions: ["retail.manage"] as RetailActor["permissions"] };
    if (kind === "create") await expect(createProduct(actor, profile())).rejects.toHaveProperty("statusCode", 403);
    if (kind === "edit") await expect(updateProduct(actor, id, { ...profile(), version: 2 })).rejects.toHaveProperty("statusCode", 403);
    if (kind === "stock") await expect(changeStock(actor, id, stockRequest())).rejects.toHaveProperty("statusCode", 403);
    expect(mongoose.connection.transaction).not.toHaveBeenCalled();
  });
});
describe("immutable retail checkout and financial-day transaction", () => {
  it("posts only the sale ledger and stock movement with server snapshots on one session", async () => {
    const result = await checkout(receptionist, input());
    expect(result.sale).toMatchObject({ amountLkr: 1000, changeLkr: 500, cashierName: receptionist.fullName, date: "2026-01-16", memberId: null, method: "CASH" });
    expect(result.sale.lines[0]).toMatchObject({ name: product.name, sku: product.sku, unitPriceLkr: 500, quantity: 2, lineTotalLkr: 1000 });
    expect(saved).toHaveLength(2); expect(saved[0]).toBeInstanceOf(StockMovement); expect(saved[1]).toBeInstanceOf(RetailSale);
    expect(FinancialDay.findOneAndUpdate).toHaveBeenCalledWith({ _id: "2026-01-16" }, { $inc: { revision: 1 }, $setOnInsert: { closed: false } }, { upsert: true, new: true, session });
    expect(mongoose.connection.transaction).toHaveBeenCalledWith(expect.any(Function), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    expect(mongoose.Model.prototype.save).toHaveBeenCalledWith({ session });
  });
  it.each(["CARD", "BANK_TRANSFER"] as const)("records %s as one non-cash sale without cash change", async method => {
    expect((await checkout(admin, { ...input(), method, cashTenderedLkr: null })).sale).toMatchObject({ method, amountLkr: 1000, cashTenderedLkr: null, changeLkr: 0 });
  });
  it("preserves historical prices/names and replays after a closed day without another deduction", async () => {
    const first = await checkout(receptionist, input());
    const sale = saved.find(row => row instanceof RetailSale)!; product.name = "Changed product"; product.sellingPriceLkr = 900;
    vi.mocked(RetailSale.findOne).mockReturnValue(sessionValue(sale)); vi.mocked(FinancialDay.findOneAndUpdate).mockClear(); vi.mocked(RetailProduct.findOneAndUpdate).mockClear();
    const second = await checkout(receptionist, input()); expect(second).toEqual({ ...first, replayed: true });
    expect(FinancialDay.findOneAndUpdate).not.toHaveBeenCalled(); expect(RetailProduct.findOneAndUpdate).not.toHaveBeenCalled(); expect(saved).toHaveLength(2);
  });
  it.each(["actor", "quantity", "method", "total", "reference"])("rejects idempotency reuse with changed %s", async kind => {
    await checkout(receptionist, input()); vi.mocked(RetailSale.findOne).mockReturnValue(sessionValue(saved.find(row => row instanceof RetailSale)));
    const next = input(); let actor = receptionist;
    if (kind === "actor") actor = admin;
    if (kind === "quantity") next.items[0].quantity = 3;
    if (kind === "method") { next.method = "CARD"; next.cashTenderedLkr = null; }
    if (kind === "total") next.expectedTotalLkr++;
    if (kind === "reference") next.reference = "OTHER";
    await expect(checkout(actor, next)).rejects.toHaveProperty("statusCode", 409); expect(saved).toHaveLength(2);
  });
  it.each(["quoted-price", "total", "stock", "inactive", "missing", "conditional-write"])("rejects %s problems before a sale can be recorded", async kind => {
    const request = input();
    if (kind === "quoted-price") request.items[0].expectedUnitPriceLkr = 1;
    if (kind === "total") request.expectedTotalLkr = 1;
    if (kind === "stock") product.stock = 1;
    if (kind === "inactive") product.isActive = false;
    if (kind === "missing") vi.mocked(RetailProduct.findById).mockReturnValue(sessionValue(null));
    if (kind === "conditional-write") vi.mocked(RetailProduct.findOneAndUpdate).mockResolvedValue(null);
    await expect(checkout(receptionist, request)).rejects.toHaveProperty("statusCode", 409); expect(saved).toHaveLength(0);
  });
  it("uses price, activation, stock minimum and version conditions in the atomic deduction", async () => {
    await checkout(admin, input());
    expect(RetailProduct.findOneAndUpdate).toHaveBeenCalledWith({ _id: product._id, isActive: true, version: 2, sellingPriceLkr: 500, stock: { $gte: 2 } }, { $inc: { stock: -2, version: 1 } }, { new: true, runValidators: true, session });
  });
  it("rejects closed-day checkout before any product mutation or sale append", async () => {
    vi.mocked(FinancialDay.findOneAndUpdate).mockResolvedValue(new FinancialDay({ _id: "2026-01-16", revision: 9, closed: true }));
    await expect(checkout(admin, input())).rejects.toHaveProperty("statusCode", 409);
    expect(RetailProduct.findOneAndUpdate).not.toHaveBeenCalled(); expect(saved).toHaveLength(0);
  });
  it("allows an existing active member only with member-reading permission", async () => {
    await expect(checkout(receptionist, { ...input(), memberId })).rejects.toHaveProperty("statusCode", 403);
    expect(Member.findById).not.toHaveBeenCalled();
    const result = await checkout(admin, { ...input(), memberId }); expect(result.sale).toMatchObject({ memberId, memberName: "Fictional Member", memberReference: "WF-DEMO-ONLY" });
  });
  it.each(["missing", "inactive"])("rejects %s associated members", async kind => {
    vi.mocked(Member.findById).mockReturnValue(sessionValue(kind === "missing" ? null : Member.hydrate({ _id: memberId, isActive: false })));
    await expect(checkout(admin, { ...input(), memberId })).rejects.toHaveProperty("statusCode", 400); expect(saved).toHaveLength(0);
  });
  it.each([[], ["retail.read"], ["retail.checkout"]] as string[][])("preserves restricted checkout grants %j", async (...permissions) => {
    await expect(checkout({ ...receptionist, permissions: permissions as RetailActor["permissions"] }, input())).rejects.toHaveProperty("statusCode", 403); expect(mongoose.connection.transaction).not.toHaveBeenCalled();
  });
  it.each(["StockMovement", "RetailSale"])("aborts the transaction callback on %s failure, rather than reporting a sale", async model => {
    failSave = model; await expect(checkout(admin, input())).rejects.toThrow("persistence failure");
    // Same-session/error wiring only. No live rollback is established by a save mock.
    expect(mongoose.Model.prototype.save).toHaveBeenCalledWith({ session });
  });
  it("does not expose staged mock writes after callback failure (simulation, not MongoDB rollback)", async () => {
    const visible: mongoose.Document[] = [];
    vi.mocked(mongoose.connection.transaction).mockImplementation(async callback => {
      const start = saved.length; const result = await callback(session); visible.push(...saved.slice(start)); return result;
    });
    failSave = "RetailSale"; await expect(checkout(admin, input())).rejects.toThrow(); expect(visible).toHaveLength(0);
  });
  it("checks all lines before writing stock and uses deterministic product ordering", async () => {
    vi.mocked(RetailProduct.findById).mockImplementation((value: unknown) => sessionValue(value === id ? product : null));
    await expect(checkout(admin, { ...input(), items: [{ productId: other, quantity: 1, expectedUnitPriceLkr: 500 }, input().items[0]], expectedTotalLkr: 1500 })).rejects.toHaveProperty("statusCode", 409);
    expect(RetailProduct.findById).toHaveBeenNthCalledWith(1, id); expect(RetailProduct.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("models two concurrent checkouts competing for one unit without negative stock", async () => {
    let available = 1, version = 2;
    vi.mocked(RetailProduct.findById).mockImplementation(() => sessionValue(fixture({ stock: 1, version: 2 })));
    vi.mocked(RetailProduct.findOneAndUpdate).mockImplementation((async (filter: unknown) => {
      const requested = filter as { version: number; stock: { $gte: number } };
      if (requested.version !== version || available < requested.stock.$gte) return null;
      available -= requested.stock.$gte; version++;
      return fixture({ stock: available, version });
    }) as never);
    const one = { ...input(), items: [{ ...input().items[0], quantity: 1 }], expectedTotalLkr: 500 };
    const outcomes = await Promise.allSettled([checkout(admin, one), checkout(admin, { ...one, requestId: "33333333-3333-4333-8333-333333333333" })]);
    expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1); expect(outcomes.filter(row => row.status === "rejected")).toHaveLength(1); expect(available).toBe(0); expect(saved.filter(row => row instanceof RetailSale)).toHaveLength(1);
    // This is an atomic-predicate simulation; actual server conflict/retry behavior remains unverified.
  });
  it("defines immutable unique sale/idempotency keys and model-level append-only hooks", async () => {
    expect(RetailSale.schema.path("requestId").options).toMatchObject({ unique: true, immutable: true });
    expect(RetailSale.schema.path("amountLkr").options.immutable).toBe(true);
    const hooks = (schema: mongoose.Schema) => (schema as unknown as { s: { hooks: { execPre: (name: string, context: object, args: unknown[]) => Promise<unknown> } } }).s.hooks;
    await expect(hooks(RetailSale.schema).execPre("updateOne", {}, [])).rejects.toThrow("cannot be modified");
    await expect(hooks(StockMovement.schema).execPre("deleteMany", {}, [])).rejects.toThrow("cannot be modified");
  });
});
