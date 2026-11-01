import type { DayPreview } from "../../src/types/financial";
import type { AutomaticSimulationStatus } from "../../src/api/notifications.api";
import type { EquipmentFaultAlert } from "../../src/types/equipment";
import { maintenanceFixture } from "./equipment";
import { retailDashboard, retailProduct, retailSale, retailSales } from "./retail";
import { gymDate } from "./dashboard";
import { addCalendarDays } from "../../src/utils/dashboard";

export const commandDay: Extract<DayPreview, { status: "OPEN" }> = {
  success: true, status: "OPEN", date: gymDate, revision: 4,
  totals: { membershipCollections: { CASH: 10000, CARD: 2000, BANK_TRANSFER: 500 }, retailCollections: { CASH: 1500, CARD: 1000, BANK_TRANSFER: 0 }, collections: { CASH: 11500, CARD: 3000, BANK_TRANSFER: 500 }, expenses: { CASH: 2000, CARD: 0, BANK_TRANSFER: 0 }, paymentCount: 3, retailSaleCount: 2, expenseCount: 1 },
};
export const commandEquipment = { ...maintenanceFixture, asOfDate: gymDate, queue: maintenanceFixture.queue.map(item => ({ ...item, nextServiceDate: "2026-10-31" })) };
export const commandFaults: { success: true; data: EquipmentFaultAlert[] } = { success: true, data: [{ id: "000000000000000000000102", equipmentId: commandEquipment.queue[0].id, equipmentName: commandEquipment.queue[0].name, assetId: "GYM-100", description: "Fictional safety fault: belt jammed", severity: "CRITICAL", status: "OPEN", reportedAt: "2026-11-01T01:00:00Z" }] };
export const commandScheduler: AutomaticSimulationStatus = {
  enabled: true, timeZone: "Asia/Colombo", dailyTime: "09:00", nextRunAt: "2026-11-01T03:30:00Z", deliveryMode: "SIMULATION_ONLY", historyAvailable: true,
  lastRun: { scheduledDate: "2026-10-31", status: "FAILED", startedAt: "2026-10-31T03:30:00Z", completedAt: "2026-10-31T03:31:00Z", summary: null, failureCode: "SIMULATION_FAILED" },
};
const sale = { ...retailSale, date: gymDate, soldAt: "2026-10-31T20:00:00Z" };
export const commandRetail = { ...retailDashboard, today: { ...retailDashboard.today, date: gymDate, amountLkr: 999999 }, period: { from: addCalendarDays(gymDate, -6), to: gymDate }, summary: { amountLkr: 5500, count: 8, units: 10 }, trend: [0, 500, 500, 0, 1000, 1000, 2500].map((value, index) => ({ date: addCalendarDays(gymDate, index - 6), value })), recent: [sale], stock: { ...retailDashboard.stock, lowStockCount: 1, lowStock: [{ ...retailProduct, stock: 2 }] } };
export const commandOwnSales = { ...retailSales, data: [sale], period: { from: gymDate, to: gymDate } };
