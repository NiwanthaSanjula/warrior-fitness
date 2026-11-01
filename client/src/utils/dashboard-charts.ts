import { addCalendarDays } from "./dashboard";
import type { MembershipActivityReport } from "../types/reports";

export interface ChartDay { date: string; value: number }

// Both ledger APIs return every calendar date, including genuine zero days.
// Missing/duplicate dates are unavailable data, never invented zero values.
export function completeSeries(rows: ChartDay[], from: string, to: string): ChartDay[] {
  const dates: string[] = [];
  for (let date = from; date <= to && dates.length < 31; date = addCalendarDays(date, 1)) dates.push(date);
  if (!dates.length || dates.length !== rows.length || new Set(rows.map(row => row.date)).size !== rows.length || rows.some(row => !dates.includes(row.date) || !Number.isSafeInteger(row.value) || row.value < 0)) throw new Error("Daily chart data is incomplete. Retry this source.");
  return dates.map(date => rows.find(row => row.date === date)!);
}

export function membershipMix(report: MembershipActivityReport) {
  const types = report.byType;
  if (!Number.isSafeInteger(report.summary.totalPurchases) || report.summary.totalPurchases < 0 || types.some(row => !Number.isSafeInteger(row.purchases) || row.purchases < 0) || new Set(types.map(row => row.enrollmentType)).size !== types.length || types.reduce((sum, row) => sum + row.purchases, 0) !== report.summary.totalPurchases) throw new Error("Membership purchase breakdown is unavailable.");
  return types.filter(row => row.purchases > 0).map(row => ({ label: row.enrollmentType === "INITIAL" ? "New" : row.enrollmentType === "RENEWAL" ? "Renewals" : row.enrollmentType, value: row.purchases }));
}
