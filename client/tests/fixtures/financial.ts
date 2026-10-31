import type { ClosingList, ClosingRecord, DayPreview, ExpenseList, ExpenseRecord } from "../../src/types/financial";

export const expenseFixture: ExpenseRecord = {
  id: "expense-example", category: "RENT", description: "Fictional gym rent", amountLkr: 2000,
  currency: "LKR", method: "CASH", expenseDate: "2026-01-15", reference: "EXAMPLE-RENT",
  responsibleStaffId: "000000000000000000000001", responsibleStaffName: "Example Admin", createdAt: "2026-01-15T06:00:00.000Z",
};
export const expenseListFixture: ExpenseList = {
  success: true, data: [expenseFixture], period: { from: "2025-12-17", to: "2026-01-15" },
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, summary: { amountLkr: 2000, count: 1 },
  byCategory: [{ category: "RENT", amountLkr: 2000 }], byMethod: [{ method: "CASH", amountLkr: 2000 }, { method: "BANK_TRANSFER", amountLkr: 0 }, { method: "CARD", amountLkr: 0 }],
};
export const dayFixture: Extract<DayPreview, { status: "OPEN" }> = {
  success: true, status: "OPEN", date: "2026-01-15", revision: 3,
  totals: { collections: { CASH: 10000, BANK_TRANSFER: 50000, CARD: 25000 }, expenses: { CASH: 2000, BANK_TRANSFER: 9000, CARD: 0 }, paymentCount: 4, expenseCount: 2 },
};
export const closingFixture: ClosingRecord = {
  id: "closing-example", date: "2026-01-15", currency: "LKR", timezone: "Asia/Colombo",
  openingCashLkr: 3000, actualCashLkr: 10800, expectedCashLkr: 11000, varianceLkr: -200,
  explanation: "Fictional cash shortage", totals: dayFixture.totals,
  closedById: "000000000000000000000001", closedByName: "Example Admin", closedAt: "2026-01-15T14:00:00.000Z",
};
export const historyFixture: ClosingList = {
  success: true, data: [closingFixture], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, period: { from: "2025-12-17", to: "2026-01-15" },
};
