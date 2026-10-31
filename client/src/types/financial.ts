export type ExpenseCategory = "RENT" | "ELECTRICITY" | "WATER" | "SALARIES" | "EQUIPMENT" | "MAINTENANCE" | "SUPPLIES" | "OTHER";
export type FinancialMethod = "CASH" | "BANK_TRANSFER" | "CARD";
export const categoryLabels: Record<ExpenseCategory, string> = {
  RENT: "Rent", ELECTRICITY: "Electricity", WATER: "Water", SALARIES: "Salaries",
  EQUIPMENT: "Equipment", MAINTENANCE: "Maintenance", SUPPLIES: "Supplies", OTHER: "Other",
};
export const methodLabels: Record<FinancialMethod, string> = { CASH: "Cash", BANK_TRANSFER: "Bank Transfer", CARD: "Card" };
export interface ExpenseInput {
  requestId: string; category: ExpenseCategory; description: string; amountLkr: number;
  method: FinancialMethod; expenseDate: string; reference: string;
}
export interface ExpenseRecord extends Omit<ExpenseInput, "requestId"> {
  id: string; currency: "LKR"; responsibleStaffId: string; responsibleStaffName: string; createdAt: string;
}
export interface Pagination { page: number; limit: number; total: number; totalPages: number }
export interface PeriodFilters { from: string; to: string; page?: number; limit?: number }
export interface ExpenseFilters extends PeriodFilters { search?: string; category?: ExpenseCategory; method?: FinancialMethod }
export interface ExpenseList {
  success: boolean; data: ExpenseRecord[]; pagination: Pagination; period: { from: string; to: string };
  summary: { amountLkr: number; count: number };
  byCategory: { category: ExpenseCategory; amountLkr: number }[];
  byMethod: { method: FinancialMethod; amountLkr: number }[];
}
export interface DayTotals {
  collections: Record<FinancialMethod, number>; expenses: Record<FinancialMethod, number>;
  paymentCount: number; expenseCount: number;
}
export interface ClosingInput {
  requestId: string; date: string; openingCashLkr: number; actualCashLkr: number;
  explanation: string; expectedRevision: number;
}
export interface ClosingRecord {
  id: string; date: string; currency: "LKR"; timezone: "Asia/Colombo";
  openingCashLkr: number; actualCashLkr: number; expectedCashLkr: number; varianceLkr: number;
  explanation: string; totals: DayTotals; closedById: string; closedByName: string; closedAt: string;
}
export type DayPreview =
  | { success: boolean; status: "CLOSED"; closing: ClosingRecord }
  | { success: boolean; status: "OPEN"; date: string; revision: number; totals: DayTotals };
export interface ClosingList { success: boolean; data: ClosingRecord[]; pagination: Pagination; period: { from: string; to: string } }
export interface FinancialWrite<T> { success: boolean; data: T; replayed: boolean }
