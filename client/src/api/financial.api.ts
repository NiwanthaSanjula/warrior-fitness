import { api } from "./api";
import type { ClosingInput, ClosingList, ClosingRecord, DayPreview, ExpenseFilters, ExpenseInput, ExpenseList, ExpenseRecord, FinancialWrite, PeriodFilters } from "../types/financial";

export const financialApi = {
  async getExpenses(params: ExpenseFilters, signal?: AbortSignal): Promise<ExpenseList> {
    return (await api.get<ExpenseList>("/expenses", { params, signal })).data;
  },
  async createExpense(input: ExpenseInput): Promise<FinancialWrite<ExpenseRecord>> {
    return (await api.post<FinancialWrite<ExpenseRecord>>("/expenses", input)).data;
  },
  async getDay(date: string, signal?: AbortSignal): Promise<DayPreview> {
    return (await api.get<DayPreview>(`/cash-closings/day/${encodeURIComponent(date)}`, { signal })).data;
  },
  async closeDay(input: ClosingInput): Promise<FinancialWrite<ClosingRecord>> {
    return (await api.post<FinancialWrite<ClosingRecord>>("/cash-closings", input)).data;
  },
  async getClosings(params: PeriodFilters, signal?: AbortSignal): Promise<ClosingList> {
    return (await api.get<ClosingList>("/cash-closings", { params, signal })).data;
  },
};
