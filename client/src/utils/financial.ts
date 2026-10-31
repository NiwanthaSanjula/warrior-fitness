import axios from "axios";
import type { DayTotals } from "../types/financial";

// Only a confirmed rejection releases a key. Unknown/network/5xx outcomes keep
// the exact payload for retry, because the first attempt may have committed.
export function definiteFinancialRejection(error: unknown): boolean {
  return axios.isAxiosError(error) && [400, 401, 403, 404, 409, 422].includes(error.response?.status ?? 0);
}
export function cashPreview(opening: string, actual: string, totals: DayTotals) {
  const valid = (value: string) => value.trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  const expected = valid(opening) ? Number(opening) + totals.collections.CASH - totals.expenses.CASH : null;
  const variance = expected !== null && valid(actual) ? Number(actual) - expected : null;
  return { expected, variance };
}
export function formatFinancialTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
