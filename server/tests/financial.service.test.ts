import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Expense, type IExpense } from "../src/modules/financial/expense.model.js";
import { CashClosing, type ICashClosing } from "../src/modules/financial/cash-closing.model.js";
import { FinancialDay } from "../src/modules/financial/financial-day.model.js";
import { Payment } from "../src/modules/billing/payment.model.js";
import { financialTransaction, lockOpenFinancialDay } from "../src/modules/financial/financial-day.service.js";
import { closeDay, createExpense, listClosings, listExpenses, previewDay } from "../src/modules/financial/financial.service.js";

const actor = { id: "000000000000000000000001", fullName: "Example Admin" };
const expenseInput = { requestId: "a93fa840-22d1-4e6f-86bc-c397822e8b8b", category: "RENT" as const, description: "Fictional rent", amountLkr: 2000, method: "CASH" as const, expenseDate: "2026-01-15", reference: "" };
const closingInput = { requestId: "b93fa840-22d1-4e6f-86bc-c397822e8b8b", date: "2026-01-15", openingCashLkr: 3000, actualCashLkr: 10800, explanation: "Fictional cash difference", expectedRevision: 3 };
const session = {} as ClientSession;
const sessionResult = (value: unknown) => ({ session: vi.fn().mockResolvedValue(value) }) as never;
const savedExpenses: HydratedDocument<IExpense>[] = [];
const savedClosings: HydratedDocument<ICashClosing>[] = [];

beforeEach(() => {
  savedExpenses.length = 0; savedClosings.length = 0;
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async (work) => work(session));
  vi.spyOn(Expense, "findOne").mockReturnValue(sessionResult(null));
  vi.spyOn(CashClosing, "findOne").mockReturnValue(sessionResult(null));
  vi.spyOn(FinancialDay, "findById").mockReturnValue(sessionResult(new FinancialDay({ _id: closingInput.date, revision: 3, closed: false })));
  vi.spyOn(FinancialDay, "findOneAndUpdate").mockResolvedValue(new FinancialDay({ _id: closingInput.date, revision: 4, closed: false }));
  vi.spyOn(FinancialDay, "updateOne").mockResolvedValue({ acknowledged: true, modifiedCount: 1, matchedCount: 1, upsertedCount: 0, upsertedId: null });
  vi.spyOn(Payment, "aggregate").mockReturnValue(sessionResult([{ _id: "CASH", amountLkr: 10000, count: 2 }, { _id: "BANK_TRANSFER", amountLkr: 50000, count: 1 }, { _id: "CARD", amountLkr: 25000, count: 1 }]));
  vi.spyOn(Expense, "aggregate").mockReturnValue(sessionResult([{ _id: "CASH", amountLkr: 2000, count: 1 }]));
  // The isolation setup spies on the shared Model.save implementation. Mock it
  // once and dispatch by model so expense/closing fixtures cannot overwrite it.
  vi.spyOn(mongoose.Model.prototype, "save").mockImplementation(async function (this: HydratedDocument<IExpense> | HydratedDocument<ICashClosing>) {
    this.createdAt = new Date();
    if (this instanceof Expense) savedExpenses.push(this);
    else if (this instanceof CashClosing) savedClosings.push(this);
    else throw new Error("Unexpected financial model save");
    return this;
  });
});

describe("expense writes with explicit mocked persistence", () => {
  it("uses one session for the day guard and append, attributing responsibility to authenticated staff", async () => {
    const result = await createExpense(expenseInput, actor);
    expect(result.replayed).toBe(false);
    expect(result.data.responsibleStaffId).toBe(actor.id);
    expect(result.data.responsibleStaffName).toBe(actor.fullName);
    expect(FinancialDay.findOneAndUpdate).toHaveBeenCalledWith({ _id: expenseInput.expenseDate }, { $inc: { revision: 1 }, $setOnInsert: { closed: false } }, { upsert: true, new: true, session });
    expect(Expense.prototype.save).toHaveBeenCalledWith({ session });
  });
  it("replays a confirmed request even after its day closes without another append or guard write", async () => {
    const first = await createExpense(expenseInput, actor);
    vi.mocked(Expense.findOne).mockReturnValue(sessionResult(savedExpenses[0]));
    const replay = await createExpense(expenseInput, actor);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(Expense.prototype.save).toHaveBeenCalledOnce();
    expect(FinancialDay.findOneAndUpdate).toHaveBeenCalledOnce();
  });
  it("rejects reused keys with a changed amount or actor", async () => {
    await createExpense(expenseInput, actor);
    vi.mocked(Expense.findOne).mockReturnValue(sessionResult(savedExpenses[0]));
    await expect(createExpense({ ...expenseInput, amountLkr: 3000 }, actor)).rejects.toHaveProperty("statusCode", 409);
    await expect(createExpense(expenseInput, { ...actor, id: "000000000000000000000002" })).rejects.toHaveProperty("statusCode", 409);
    expect(Expense.prototype.save).toHaveBeenCalledOnce();
  });
  it("rejects late/backdated expenses for a closed day before saving", async () => {
    vi.mocked(FinancialDay.findOneAndUpdate).mockResolvedValue(new FinancialDay({ _id: expenseInput.expenseDate, closed: true, revision: 9 }));
    await expect(createExpense(expenseInput, actor)).rejects.toThrow("is closed");
    expect(Expense.prototype.save).not.toHaveBeenCalled();
  });
});

describe("closing snapshots with explicit mocked transactions", () => {
  it("previews one consistent snapshot with actual Colombo timestamp bounds and no lock writes", async () => {
    const preview = await previewDay(closingInput.date);
    expect(preview).toMatchObject({ status: "OPEN", revision: 3, totals: { collections: { CASH: 10000, BANK_TRANSFER: 50000, CARD: 25000 }, expenses: { CASH: 2000, BANK_TRANSFER: 0, CARD: 0 } } });
    expect(Payment.aggregate).toHaveBeenCalledWith(expect.arrayContaining([{ $match: { receivedAt: { $gte: new Date("2026-01-14T18:30:00Z"), $lt: new Date("2026-01-15T18:30:00Z") } } }]));
    expect(FinancialDay.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mongoose.connection.transaction).toHaveBeenCalledWith(expect.any(Function), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
  });
  it("rechecks the ledger and saves the immutable snapshot plus closed marker on the same session", async () => {
    const result = await closeDay(closingInput, actor);
    expect(result.data).toMatchObject({ expectedCashLkr: 11000, actualCashLkr: 10800, varianceLkr: -200, closedById: actor.id });
    expect(CashClosing.prototype.save).toHaveBeenCalledWith({ session });
    expect(FinancialDay.updateOne).toHaveBeenCalledWith({ _id: closingInput.date, closed: false, revision: 4 }, { $set: { closed: true } }, { session });
    expect(vi.mocked(FinancialDay.findOneAndUpdate).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(Payment.aggregate).mock.invocationCallOrder[0]);
  });
  it("requires a discrepancy explanation before any snapshot is saved", async () => {
    await expect(closeDay({ ...closingInput, explanation: " " }, actor)).rejects.toHaveProperty("statusCode", 400);
    expect(CashClosing.prototype.save).not.toHaveBeenCalled();
    expect(FinancialDay.updateOne).not.toHaveBeenCalled();
  });
  it("allows a balanced closing without an explanation", async () => {
    const result = await closeDay({ ...closingInput, actualCashLkr: 11000, explanation: "" }, actor);
    expect(result.data.varianceLkr).toBe(0);
  });
  it("rejects a stale preview revision before ledger aggregation or saving", async () => {
    await expect(closeDay({ ...closingInput, expectedRevision: 2 }, actor)).rejects.toThrow("ledger changed");
    expect(Payment.aggregate).not.toHaveBeenCalled();
    expect(CashClosing.prototype.save).not.toHaveBeenCalled();
  });
  it("prevents a second key from closing an already completed date", async () => {
    await closeDay(closingInput, actor);
    vi.mocked(CashClosing.findOne).mockReturnValueOnce(sessionResult(null)).mockReturnValueOnce(sessionResult(savedClosings[0]));
    await expect(closeDay({ ...closingInput, requestId: "c93fa840-22d1-4e6f-86bc-c397822e8b8b" }, actor)).rejects.toThrow("already has a completed closing");
    expect(CashClosing.prototype.save).toHaveBeenCalledOnce();
  });
  it("returns the original snapshot for a repeated key without recomputing historical totals", async () => {
    const first = await closeDay(closingInput, actor);
    vi.mocked(CashClosing.findOne).mockReturnValue(sessionResult(savedClosings[0]));
    const second = await closeDay(closingInput, actor);
    expect(second).toEqual({ ...first, replayed: true });
    expect(Payment.aggregate).toHaveBeenCalledOnce();
    expect(CashClosing.prototype.save).toHaveBeenCalledOnce();
    await expect(closeDay({ ...closingInput, actualCashLkr: 9999 }, actor)).rejects.toHaveProperty("statusCode", 409);
  });
  it("returns stored completed previews without reading the live ledger", async () => {
    await closeDay(closingInput, actor);
    vi.mocked(CashClosing.findOne).mockReturnValue(sessionResult(savedClosings[0]));
    vi.mocked(Payment.aggregate).mockClear();
    expect(await previewDay(closingInput.date)).toMatchObject({ status: "CLOSED", closing: { expectedCashLkr: 11000 } });
    expect(Payment.aggregate).not.toHaveBeenCalled();
  });
  it("treats a failed closed-marker conditional update as a transaction failure", async () => {
    vi.mocked(FinancialDay.updateOne).mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null });
    await expect(closeDay(closingInput, actor)).rejects.toHaveProperty("statusCode", 409);
    // This verifies error propagation, not real MongoDB rollback or concurrency.
  });
  it("fails safely for a closed guard without a readable closing", async () => {
    vi.mocked(FinancialDay.findById).mockReturnValue(sessionResult(new FinancialDay({ _id: closingInput.date, closed: true, revision: 4 })));
    await expect(previewDay(closingInput.date)).rejects.toHaveProperty("statusCode", 409);
  });
});

describe("transaction retries and paginated reads", () => {
  it("retries a first-use duplicate key by rerunning the entire transaction", async () => {
    vi.mocked(mongoose.connection.transaction).mockRejectedValueOnce({ code: 11000 });
    expect((await createExpense(expenseInput, actor)).replayed).toBe(false);
    expect(mongoose.connection.transaction).toHaveBeenCalledTimes(2);
  });
  it("bounds duplicate-key retries and does not retry arbitrary failures", async () => {
    vi.mocked(mongoose.connection.transaction).mockRejectedValue({ code: 11000 });
    await expect(financialTransaction(async () => "unused")).rejects.toEqual({ code: 11000 });
    expect(mongoose.connection.transaction).toHaveBeenCalledTimes(3);
    vi.mocked(mongoose.connection.transaction).mockReset().mockRejectedValue(new Error("Example transaction failure"));
    await expect(financialTransaction(async () => "unused")).rejects.toThrow("Example transaction failure");
    expect(mongoose.connection.transaction).toHaveBeenCalledOnce();
  });
  it("escapes search regexes and facets filtered summaries with pagination", async () => {
    vi.mocked(Expense.aggregate).mockResolvedValue([{ records: [], overall: [{ amountLkr: 50000, count: 22 }], byCategory: [{ _id: "RENT", amountLkr: 50000, count: 22 }], byMethod: [{ _id: "CASH", amountLkr: 50000, count: 22 }] }]);
    const result = await listExpenses({ from: "2026-01-01", to: "2026-01-15", search: "rent.*", category: "RENT", method: "CASH", page: 2, limit: 20 });
    expect(result.summary).toEqual({ amountLkr: 50000, count: 22 });
    expect(result.pagination).toEqual({ page: 2, limit: 20, total: 22, totalPages: 2 });
    expect(Expense.aggregate).toHaveBeenCalledWith(expect.arrayContaining([{ $match: expect.objectContaining({ category: "RENT", method: "CASH", $or: expect.arrayContaining([{ description: { $regex: "rent\\.\\*", $options: "i" } }]) }) }]));
  });
  it("does not query persistence for reversed or excessive selected periods", async () => {
    await expect(listExpenses({ from: "2026-01-15", to: "2026-01-01", search: "", page: 1, limit: 20 })).rejects.toHaveProperty("statusCode", 400);
    await expect(listClosings({ from: "2024-01-01", to: "2026-01-15", page: 1, limit: 20 })).rejects.toHaveProperty("statusCode", 400);
    expect(CashClosing.prototype.save).not.toHaveBeenCalled();
  });
  it("rejects aggregate totals outside safe integer LKR instead of displaying rounded money", async () => {
    vi.mocked(Expense.aggregate).mockResolvedValue([{ records: [], overall: [{ amountLkr: Number.MAX_SAFE_INTEGER + 1, count: 1 }], byCategory: [], byMethod: [] }]);
    await expect(listExpenses({ from: "2026-01-01", to: "2026-01-15", search: "", page: 1, limit: 20 })).rejects.toHaveProperty("statusCode", 400);
  });
  it("represents a genuinely empty closing history with zero records", async () => {
    vi.spyOn(CashClosing, "aggregate").mockResolvedValue([{ records: [], metadata: [] }]);
    expect(await listClosings({ from: "2026-01-01", to: "2026-01-15", page: 1, limit: 20 })).toMatchObject({ data: [], pagination: { total: 0, totalPages: 0 } });
  });
  it("rejects writes to a closed financial-day guard", async () => {
    vi.mocked(FinancialDay.findOneAndUpdate).mockResolvedValue(new FinancialDay({ _id: closingInput.date, revision: 10, closed: true }));
    await expect(lockOpenFinancialDay(closingInput.date, session)).rejects.toHaveProperty("statusCode", 409);
  });
});
