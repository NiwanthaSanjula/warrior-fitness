import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoDemoStore } from "../src/scripts/demo/demo.store.js";
import { buildDemoPlan } from "../src/scripts/demo/demo.plan.js";
import { Invoice } from "../src/modules/billing/invoice.model.js";
import { Membership, type IMembership } from "../src/modules/memberships/membership.model.js";
import { Member } from "../src/modules/members/member.model.js";
import { MembershipPlan } from "../src/modules/membership-plans/plan.model.js";
import { RetailProduct } from "../src/modules/retail/retail.model.js";
import { CashClosing } from "../src/modules/financial/cash-closing.model.js";
import * as finance from "../src/modules/financial/financial.service.js";
import * as retail from "../src/modules/retail/retail.service.js";
import { recordPaymentLedger } from "../src/modules/billing/payment.controller.js";
import { createInvoiceForMembership } from "../src/modules/billing/invoice.service.js";
import * as transactions from "../src/modules/financial/financial-day.service.js";

vi.mock("../src/modules/financial/financial.service.js", () => ({ createExpense: vi.fn(), closeDay: vi.fn(), previewDay: vi.fn(), ledgerTotals: vi.fn(), reconcileCash: vi.fn() }));
vi.mock("../src/modules/retail/retail.service.js", () => ({ createProduct: vi.fn(), changeStock: vi.fn(), checkout: vi.fn() }));
vi.mock("../src/modules/billing/payment.controller.js", () => ({ recordPaymentLedger: vi.fn() }));
vi.mock("../src/modules/billing/invoice.service.js", () => ({ createInvoiceForMembership: vi.fn() }));
const plan = buildDemoPlan(new Date("2026-01-15T06:00:00Z")), store = new MongoDemoStore("fictional-test-only-password");
const session = {} as ClientSession, sessionValue = (value: unknown) => ({ session: vi.fn().mockResolvedValue(value) }) as never;
const originalDb = Object.getOwnPropertyDescriptor(mongoose.connection, "db");
beforeEach(() => {
  Object.defineProperty(mongoose.connection, "db", { value: { databaseName: "warrior_fitness_demo" }, configurable: true });
  vi.spyOn(mongoose.models.DemoSeedState, "exists").mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
  vi.spyOn(transactions, "financialTransaction").mockImplementation(async work => work(session));
  vi.mocked(finance.createExpense).mockResolvedValue({ replayed: false } as never);
  vi.mocked(finance.closeDay).mockResolvedValue({ replayed: false } as never);
  vi.mocked(retail.createProduct).mockResolvedValue({} as never);
  vi.mocked(retail.checkout).mockResolvedValue({ replayed: false } as never);
  vi.mocked(retail.changeStock).mockResolvedValue({ replayed: false } as never);
  vi.mocked(recordPaymentLedger).mockResolvedValue({ replayed: false } as never);
});
afterEach(() => { if (originalDb) Object.defineProperty(mongoose.connection, "db", originalDb); else Reflect.deleteProperty(mongoose.connection, "db"); });

describe("Mongo demo adapter delegation with explicit model/service mocks", () => {
  it("creates a historical purchase and invoice in one existing transaction/session", async () => {
    const op = plan.operations.find(op => op.kind === "purchase")!;
    vi.spyOn(Membership, "findById").mockReturnValue(sessionValue(null));
    vi.spyOn(Membership, "exists").mockReturnValue(sessionValue(null));
    vi.spyOn(Member, "exists").mockReturnValue(sessionValue({ _id: "fictional-owned-member" }));
    vi.spyOn(MembershipPlan, "exists").mockReturnValue(sessionValue({ _id: "fictional-owned-plan" }));
    vi.spyOn(Membership.prototype, "save").mockImplementation(async function(this: HydratedDocument<IMembership>) { return this; });
    expect(await store.apply(op)).toBe(true);
    expect(transactions.financialTransaction).toHaveBeenCalledOnce();
    expect(Membership.prototype.save).toHaveBeenCalledWith({ session });
    if (op.kind === "purchase") expect(createInvoiceForMembership).toHaveBeenCalledWith(expect.objectContaining({ startDate: op.data.startDate, endDateExclusive: op.data.endDateExclusive, planSnapshot: expect.objectContaining({ priceLkr: op.data.planSnapshot.priceLkr }) }), plan.actors[0].id, session, new Date(op.data.issuedAt));
  });
  it("refuses an existing purchase whose invoice is missing without synthesizing a replacement", async () => {
    const op = plan.operations.find(op => op.kind === "purchase")!;
    if (op.kind !== "purchase") throw new Error();
    vi.spyOn(Membership, "findById").mockReturnValue(sessionValue(Membership.hydrate({ _id: op.data.id, member: op.data.memberId, startDate: op.data.startDate, endDateExclusive: op.data.endDateExclusive })));
    vi.spyOn(Invoice, "exists").mockReturnValue(sessionValue(null));
    await expect(store.apply(op)).rejects.toThrow(/purchase\/invoice conflict/);
    expect(createInvoiceForMembership).not.toHaveBeenCalled();
  });
  it("delegates historical payments to the real application's guarded ledger boundary", async () => {
    const op = plan.operations.find(op => op.kind === "payment")!;
    const invoice = { _id: new mongoose.Types.ObjectId() }; vi.spyOn(Invoice, "findOne").mockResolvedValue(invoice as never);
    expect(await store.apply(op)).toBe(true);
    if (op.kind === "payment") expect(recordPaymentLedger).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: String(invoice._id), requestId: op.data.requestId, amountLkr: op.data.amountLkr }), expect.objectContaining({ id: plan.actors[0].id }), new Date(op.data.receivedAt));
    vi.mocked(recordPaymentLedger).mockResolvedValue({ replayed: true } as never);
    expect(await store.apply(op)).toBe(false);
    expect(mongoose.Model.prototype.save).not.toHaveBeenCalled();
  });
  it("creates products/opening stock through the existing retail transaction and skips owned SKUs", async () => {
    const op = plan.operations.find(op => op.kind === "product")!;
    vi.spyOn(RetailProduct, "findOne").mockResolvedValue(null);
    expect(await store.apply(op)).toBe(true);
    expect(retail.createProduct).toHaveBeenCalledWith(expect.objectContaining({ role: "ADMIN" }), expect.objectContaining({ initialStock: expect.any(Number) }), expect.any(Date));
    expect(vi.mocked(retail.createProduct).mock.calls[0][1]).not.toHaveProperty("targetStock");
    vi.mocked(RetailProduct.findOne).mockResolvedValue({ _id: "fictional-product", createdBy: plan.actors[0].id } as never);
    expect(await store.apply(op)).toBe(false); expect(retail.createProduct).toHaveBeenCalledOnce();
  });
  it("resolves demo SKUs and uses existing checkout, preserving request ID, cashier and timestamp", async () => {
    const op = plan.operations.find(op => op.kind === "sale")!;
    vi.spyOn(RetailProduct, "findOne")
      .mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(), createdBy: plan.actors[0].id } as never)
      .mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(), createdBy: plan.actors[0].id } as never);
    expect(await store.apply(op)).toBe(true);
    if (op.kind === "sale") expect(retail.checkout).toHaveBeenCalledWith(expect.objectContaining({ id: op.data.cashierId, role: "RECEPTIONIST" }), expect.objectContaining({ requestId: op.data.requestId, expectedTotalLkr: op.data.expectedTotalLkr, items: expect.arrayContaining([expect.objectContaining({ productId: expect.any(String), quantity: expect.any(Number) })]) }), new Date(op.data.soldAt));
    expect(recordPaymentLedger).not.toHaveBeenCalled();
  });
  it("uses current product version and the stable request key for a replayable restock", async () => {
    const op = plan.operations.find(op => op.kind === "stock")!;
    vi.spyOn(RetailProduct, "findOne").mockResolvedValue({ _id: new mongoose.Types.ObjectId(), createdBy: plan.actors[0].id, version: 9 } as never);
    expect(await store.apply(op)).toBe(true);
    expect(retail.changeStock).toHaveBeenCalledWith(expect.any(Object), expect.any(String), expect.objectContaining({ version: 9, kind: "RESTOCK" }), expect.any(Date));
  });
  it("validates expenses and delegates to the existing idempotent service", async () => {
    const op = plan.operations.find(op => op.kind === "expense")!;
    expect(await store.apply(op)).toBe(true); expect(finance.createExpense).toHaveBeenCalledWith(op.data, expect.objectContaining({ role: "ADMIN" }));
    vi.mocked(finance.createExpense).mockResolvedValue({ replayed: true } as never); expect(await store.apply(op)).toBe(false);
    const malformed = structuredClone(op); if (malformed.kind === "expense") malformed.data.amountLkr = 1.5;
    await expect(store.apply(malformed)).rejects.toThrow(); expect(finance.createExpense).toHaveBeenCalledTimes(2);
  });
  it("refuses a closing when the current ledger differs from the planned snapshot", async () => {
    const op = plan.operations.find(op => op.kind === "closing")!;
    if (op.kind !== "closing") throw new Error();
    vi.spyOn(CashClosing, "findOne").mockResolvedValue(null);
    const totals = structuredClone(op.data.expectedTotals); totals.collections.CASH++;
    vi.mocked(finance.previewDay).mockResolvedValue({ status: "OPEN", date: op.data.date, revision: 7, totals } as never);
    await expect(store.apply(op)).rejects.toThrow(/Actual ledger differs/); expect(finance.closeDay).not.toHaveBeenCalled();
  });
  it("preserves completed closings and refuses any conflicting historical snapshot", async () => {
    const op = plan.operations.find(op => op.kind === "closing")!; if (op.kind !== "closing") throw new Error();
    vi.spyOn(CashClosing, "findOne").mockResolvedValue({ requestId: op.data.requestId, totals: op.data.expectedTotals } as never);
    expect(await store.apply(op)).toBe(false); expect(finance.previewDay).not.toHaveBeenCalled(); expect(finance.closeDay).not.toHaveBeenCalled();
    vi.mocked(CashClosing.findOne).mockResolvedValue({ requestId: "unrelated-closing", totals: op.data.expectedTotals } as never);
    await expect(store.apply(op)).rejects.toThrow(/Existing closing differs/); expect(finance.closeDay).not.toHaveBeenCalled();
  });
  it("closes only through the existing revision-checked transaction after confirming actual totals", async () => {
    const op = plan.operations.find(op => op.kind === "closing")!; if (op.kind !== "closing") throw new Error();
    vi.spyOn(CashClosing, "findOne").mockResolvedValue(null);
    vi.mocked(finance.previewDay).mockResolvedValue({ status: "OPEN", date: op.data.date, revision: 7, totals: op.data.expectedTotals } as never);
    expect(await store.apply(op)).toBe(true);
    expect(finance.closeDay).toHaveBeenCalledWith(expect.objectContaining({ requestId: op.data.requestId, expectedRevision: 7, openingCashLkr: op.data.openingCashLkr, actualCashLkr: op.data.actualCashLkr }), expect.objectContaining({ role: "ADMIN" }));
  });
});
