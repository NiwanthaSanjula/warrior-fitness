import { describe, expect, it, vi } from "vitest";
import { expenseInputSchema, closingInputSchema, financialDate } from "../src/modules/financial/financial.validation.js";
import { reconcileCash } from "../src/modules/financial/financial.service.js";
import { Expense } from "../src/modules/financial/expense.model.js";
import { CashClosing, type DayTotals } from "../src/modules/financial/cash-closing.model.js";
import { rejectFinancialMutation } from "../src/modules/financial/append-only.js";

const expenseInput = {
  requestId: "a93fa840-22d1-4e6f-86bc-c397822e8b8b", category: "RENT" as const,
  description: "Fictional gym rent", amountLkr: 2000, method: "CASH" as const,
  expenseDate: "2026-01-15", reference: "",
};
const closingInput = {
  requestId: "b93fa840-22d1-4e6f-86bc-c397822e8b8b", date: "2026-01-15",
  openingCashLkr: 3000, actualCashLkr: 10800, explanation: "Fictional cash count difference", expectedRevision: 3,
};

describe("financial validation and record protection", () => {
  it.each([0, -1, 0.5, 10000001, NaN, Infinity])("rejects an invalid expense amount %s", (amountLkr) => {
    expect(expenseInputSchema.safeParse({ ...expenseInput, amountLkr }).success).toBe(false);
  });
  it("normalizes optional references and rejects client-supplied responsible staff or computed totals", () => {
    expect(expenseInputSchema.parse({ ...expenseInput, reference: undefined }).reference).toBe("");
    expect(expenseInputSchema.safeParse({ ...expenseInput, responsibleStaff: "spoof" }).success).toBe(false);
    expect(closingInputSchema.safeParse({ ...closingInput, expectedCashLkr: 0 }).success).toBe(false);
  });
  it.each(["2026-02-30", "2026-01-16", "2006-01-01", "15/01/2026"])("rejects invalid/future/unsupported financial dates %s", (date) => {
    expect(financialDate.safeParse(date).success).toBe(false);
  });
  it("uses Colombo today across a UTC day boundary", () => {
    vi.setSystemTime(new Date("2026-01-15T20:00:00Z"));
    expect(financialDate.safeParse("2026-01-16").success).toBe(true);
    expect(financialDate.safeParse("2026-01-17").success).toBe(false);
  });
  it("requires supported categories, methods, UUID keys and complete whole-number counts", () => {
    for (const change of [{ category: "UNKNOWN" }, { method: "CHEQUE" }, { requestId: "bad" }, { description: " " }]) {
      expect(expenseInputSchema.safeParse({ ...expenseInput, ...change }).success).toBe(false);
    }
    for (const change of [{ openingCashLkr: -1 }, { actualCashLkr: 1.5 }, { expectedRevision: -1 }]) {
      expect(closingInputSchema.safeParse({ ...closingInput, ...change }).success).toBe(false);
    }
  });
  it("has unique request/date indexes, immutable monetary fields and a mutation rejection hook", () => {
    expect(Expense.schema.indexes()).toContainEqual([{ requestId: 1 }, expect.objectContaining({ unique: true })]);
    expect(CashClosing.schema.indexes()).toContainEqual([{ date: 1 }, expect.objectContaining({ unique: true })]);
    expect(CashClosing.schema.indexes()).toContainEqual([{ requestId: 1 }, expect.objectContaining({ unique: true })]);
    for (const path of ["amountLkr", "expenseDate", "responsibleStaff", "method"]) expect(Expense.schema.path(path).options.immutable).toBe(true);
    for (const path of ["expectedCashLkr", "actualCashLkr", "varianceLkr", "totals", "closedBy", "date"]) expect(CashClosing.schema.path(path).options.immutable).toBe(true);
    expect(rejectFinancialMutation).toThrow("cannot be modified or deleted");
  });
  it("validates expense model integer constraints without a database", async () => {
    const expense = new Expense({ ...expenseInput, fingerprint: "example", responsibleStaff: "000000000000000000000001", responsibleStaffName: "Example Admin", amountLkr: 1.5 });
    await expect(expense.validate()).rejects.toHaveProperty("name", "ValidationError");
  });
});

describe("cash reconciliation", () => {
  const totals: DayTotals = { collections: { CASH: 10000, BANK_TRANSFER: 50000, CARD: 25000 }, expenses: { CASH: 2000, BANK_TRANSFER: 9000, CARD: 7000 }, paymentCount: 4, expenseCount: 3 };
  it.each([[11000, 0], [10800, -200], [11500, 500]])("computes expected cash and signed variance for actual %s", (actual, varianceLkr) => {
    expect(reconcileCash(3000, actual, totals)).toEqual({ expectedCashLkr: 11000, varianceLkr });
  });
  it("allows real zero ledgers without inventing collections", () => {
    expect(reconcileCash(0, 0, { collections: { CASH: 0, BANK_TRANSFER: 0, CARD: 0 }, expenses: { CASH: 0, BANK_TRANSFER: 0, CARD: 0 }, paymentCount: 0, expenseCount: 0 })).toEqual({ expectedCashLkr: 0, varianceLkr: 0 });
  });
  it("rejects unsafe or fractional ledger totals", () => {
    expect(() => reconcileCash(Number.MAX_SAFE_INTEGER, 0, totals)).toThrow("safe whole-number");
    expect(() => reconcileCash(0.5, 0, totals)).toThrow("safe whole-number");
  });
});
