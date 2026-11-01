import mongoose, { type ClientSession } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Payment } from "../src/modules/billing/payment.model.js";
import { Expense } from "../src/modules/financial/expense.model.js";
import { CashClosing, publicClosing } from "../src/modules/financial/cash-closing.model.js";
import { FinancialDay } from "../src/modules/financial/financial-day.model.js";
import { closeDay, ledgerTotals, previewDay, reconcileCash } from "../src/modules/financial/financial.service.js";
import { RetailSale } from "../src/modules/retail/retail.model.js";
const session = {} as ClientSession, sessionValue = (value: unknown) => ({ session: vi.fn().mockResolvedValue(value) }) as never;
const actor = { id: "000000000000000000000001", fullName: "Example Admin" }, date = "2026-01-15";
const closingInput = { date, requestId: "11111111-1111-4111-8111-111111111111", openingCashLkr: 1000, actualCashLkr: 6900, explanation: "Fictional cash shortage", expectedRevision: 3 };
const saved: mongoose.Document[] = [];
beforeEach(() => {
  saved.length = 0;
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async callback => callback(session));
  vi.spyOn(Payment, "aggregate").mockReturnValue(sessionValue([{ _id: "CASH", amountLkr: 5000, count: 1 }, { _id: "CARD", amountLkr: 1000, count: 1 }, { _id: "BANK_TRANSFER", amountLkr: 2000, count: 1 }]));
  vi.spyOn(RetailSale, "aggregate").mockReturnValue(sessionValue([{ _id: "CASH", amountLkr: 2000, count: 1 }, { _id: "CARD", amountLkr: 3000, count: 1 }, { _id: "BANK_TRANSFER", amountLkr: 4000, count: 1 }]));
  vi.spyOn(Expense, "aggregate").mockReturnValue(sessionValue([{ _id: "CASH", amountLkr: 1000, count: 1 }, { _id: "CARD", amountLkr: 500, count: 1 }]));
  vi.spyOn(CashClosing, "findOne").mockReturnValue(sessionValue(null));
  vi.spyOn(FinancialDay, "findById").mockReturnValue(sessionValue(new FinancialDay({ _id: date, revision: 3, closed: false })));
  vi.spyOn(FinancialDay, "findOneAndUpdate").mockResolvedValue(new FinancialDay({ _id: date, revision: 4, closed: false }));
  vi.spyOn(FinancialDay, "updateOne").mockResolvedValue({ modifiedCount: 1 } as never);
  vi.spyOn(mongoose.Model.prototype, "save").mockImplementation(async function(this: mongoose.Document) {
    if (!(this instanceof CashClosing)) throw new Error("Unexpected ledger rewrite");
    this.createdAt = new Date(); saved.push(this); return this;
  });
});
describe("retail inclusion in immutable financial reconciliation", () => {
  it("separates both revenue sources and counts POS exactly once in combined collections", async () => {
    const totals = await ledgerTotals(date, session);
    expect(totals).toEqual({ membershipCollections: { CASH: 5000, BANK_TRANSFER: 2000, CARD: 1000 }, retailCollections: { CASH: 2000, BANK_TRANSFER: 4000, CARD: 3000 }, collections: { CASH: 7000, BANK_TRANSFER: 6000, CARD: 4000 }, expenses: { CASH: 1000, BANK_TRANSFER: 0, CARD: 500 }, paymentCount: 3, retailSaleCount: 3, expenseCount: 2 });
    expect(reconcileCash(1000, 6900, totals)).toEqual({ expectedCashLkr: 7000, varianceLkr: -100 });
    expect(RetailSale.aggregate).toHaveBeenCalledWith(expect.arrayContaining([{ $match: { date } }]));
    expect(Payment.aggregate).toHaveBeenCalledWith(expect.arrayContaining([{ $match: { receivedAt: { $gte: new Date("2026-01-14T18:30:00Z"), $lt: new Date("2026-01-15T18:30:00Z") } } }]));
  });
  it("saves the retail breakdown with the closing snapshot on the same transaction session", async () => {
    const result = await closeDay(closingInput, actor);
    expect(result.data).toMatchObject({ expectedCashLkr: 7000, varianceLkr: -100, totals: { retailSaleCount: 3, retailCollections: { CASH: 2000 } } });
    expect(CashClosing.prototype.save).toHaveBeenCalledWith({ session }); expect(saved).toHaveLength(1);
    expect(FinancialDay.updateOne).toHaveBeenCalledWith({ _id: date, closed: false, revision: 4 }, { $set: { closed: true } }, { session });
  });
  it("uses all three ledger queries sequentially on the supplied snapshot session", async () => {
    await ledgerTotals(date, session);
    expect(vi.mocked(Payment.aggregate).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(Expense.aggregate).mock.invocationCallOrder[0]);
    expect(vi.mocked(Expense.aggregate).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(RetailSale.aggregate).mock.invocationCallOrder[0]);
  });
  it("invalidates a stale closing preview after the shared day revision advances", async () => {
    vi.mocked(FinancialDay.findOneAndUpdate).mockResolvedValue(new FinancialDay({ _id: date, revision: 5, closed: false }));
    await expect(closeDay(closingInput, actor)).rejects.toThrow("ledger changed"); expect(RetailSale.aggregate).not.toHaveBeenCalled(); expect(saved).toHaveLength(0);
  });
  it("never recalculates a completed snapshot after additional retail data exists", async () => {
    const first = await closeDay(closingInput, actor); vi.mocked(CashClosing.findOne).mockReturnValue(sessionValue(saved[0]));
    vi.mocked(RetailSale.aggregate).mockClear(); vi.mocked(Payment.aggregate).mockClear(); vi.mocked(Expense.aggregate).mockClear();
    expect(await previewDay(date)).toEqual({ status: "CLOSED", closing: first.data });
    expect(RetailSale.aggregate).not.toHaveBeenCalled(); expect(Payment.aggregate).not.toHaveBeenCalled(); expect(Expense.aggregate).not.toHaveBeenCalled();
  });
  it("preserves old membership-only snapshots without backfilling retail values", async () => {
    const oldTotals = { collections: { CASH: 5000, BANK_TRANSFER: 2000, CARD: 1000 }, expenses: { CASH: 1000, BANK_TRANSFER: 0, CARD: 0 }, paymentCount: 3, expenseCount: 1 };
    const old = CashClosing.hydrate({ _id: "000000000000000000000300", ...closingInput, expectedCashLkr: 5000, varianceLkr: 1900, totals: oldTotals, closedBy: actor.id, closedByName: actor.fullName, createdAt: new Date() });
    const result = publicClosing(old); expect(result.expectedCashLkr).toBe(5000); expect(result.totals.retailCollections).toBeUndefined(); expect(result.totals.membershipCollections).toBeUndefined(); expect(result.totals.collections.CASH).toBe(5000);
    vi.mocked(CashClosing.findOne).mockReturnValue(sessionValue(old)); expect((await previewDay(date)).status).toBe("CLOSED"); expect(RetailSale.aggregate).not.toHaveBeenCalled();
  });
  it("rejects inconsistent source totals and unsafe aggregate amounts", async () => {
    const totals = await ledgerTotals(date, session); totals.retailCollections!.CASH++;
    expect(() => reconcileCash(1000, 6900, totals)).toThrow("do not reconcile");
    vi.mocked(RetailSale.aggregate).mockReturnValue(sessionValue([{ _id: "CASH", amountLkr: Number.MAX_SAFE_INTEGER, count: 1 }]));
    await expect(ledgerTotals(date, session)).rejects.toThrow("safe whole-number");
  });
});
