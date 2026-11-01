import type { AutomaticSimulationStatus } from "../api/notifications.api";
import type { DayPreview, FinancialMethod } from "../types/financial";

export interface CollectionSnapshot {
  date: string; status: "OPEN" | "CLOSED"; membershipLkr: number; retailLkr: number; combinedLkr: number;
  legacy: boolean; closedAt: string | null;
}
export function collectionSnapshot(preview: DayPreview, expectedDate: string): CollectionSnapshot {
  const date = preview.status === "CLOSED" ? preview.closing.date : preview.date;
  if (date !== expectedDate) throw new Error("The closing summary belongs to a different gym date. Refresh the dashboard.");
  const totals = preview.status === "CLOSED" ? preview.closing.totals : preview.totals;
  const legacy = preview.status === "CLOSED" && totals.membershipCollections === undefined && totals.retailCollections === undefined;
  if (!legacy && (!totals.membershipCollections || !totals.retailCollections)) throw new Error("Collection source breakdown is unavailable. Review Daily Cash Closing.");
  const membership = legacy ? totals.collections : totals.membershipCollections!;
  const retail = legacy ? { CASH: 0, CARD: 0, BANK_TRANSFER: 0 } : totals.retailCollections!;
  const methods: FinancialMethod[] = ["CASH", "CARD", "BANK_TRANSFER"];
  if (!methods.every(method => [totals.collections[method], membership[method], retail[method]].every(value => Number.isSafeInteger(value) && value >= 0) && membership[method] + retail[method] === totals.collections[method])) throw new Error("Collection sources are inconsistent. Review Daily Cash Closing.");
  // Display-only addition across payment methods from ONE authoritative closing
  // read. Never combine independently fetched report/POS/dashboard totals.
  const sum = (values: Record<FinancialMethod, number>) => methods.reduce((total, method) => total + values[method], 0);
  const membershipLkr = sum(membership), retailLkr = sum(retail), combinedLkr = sum(totals.collections);
  if (![membershipLkr, retailLkr, combinedLkr].every(Number.isSafeInteger)) throw new Error("Collections exceed safe whole-LKR display limits.");
  return { date, status: preview.status, membershipLkr, retailLkr, combinedLkr, legacy, closedAt: preview.status === "CLOSED" ? preview.closing.closedAt : null };
}
export function automationHealth(status: AutomaticSimulationStatus): { label: string; tone: "urgent" | "warning" | "quiet"; detail: string } {
  if (!status.historyAvailable) return { label: "Automation history unavailable", tone: "warning", detail: "Execution could not be confirmed. Review Notification Center." };
  if (status.lastRun?.status === "FAILED") return { label: "Reminder simulation failed", tone: "urgent", detail: "The last automatic run failed. Review the recorded failure before retrying manually." };
  if (status.lastRun?.status === "RUNNING") return { label: "Reminder completion unconfirmed", tone: "warning", detail: "A run started without confirmed completion. It may still be running or may have been interrupted." };
  if (!status.enabled) return { label: "Automatic simulation disabled", tone: "quiet", detail: "Manual simulation remains available in Notification Center." };
  if (!status.lastRun) return { label: "Automatic simulation enabled", tone: "quiet", detail: "No automatic execution has been recorded yet." };
  return { label: "Reminder simulation completed", tone: "quiet", detail: "The last automatic run completed. Delivery remains simulation-only." };
}
export interface CommandAlert { id: string; priority: number; title: string; detail: string; to: string; action: string }
export const orderedAlerts = (alerts: CommandAlert[]) => [...alerts].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
