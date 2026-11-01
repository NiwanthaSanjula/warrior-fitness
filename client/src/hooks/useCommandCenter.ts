import { useCallback } from "react";
import type { AuthStaff } from "../auth/auth-context";
import { hasPermissions } from "../auth/permissions";
import { equipmentApi } from "../api/equipment.api";
import { retailApi } from "../api/retail.api";
import { notificationsApi } from "../api/notifications.api";
import { financialApi } from "../api/financial.api";
import { collectionSnapshot } from "../utils/command-center";
import { addCalendarDays } from "../utils/dashboard";
import { useDashboardResource } from "./useDashboardResource";

const loadEquipment = (signal: AbortSignal) => equipmentApi.dashboard(1, signal);
const loadFaults = (signal: AbortSignal) => equipmentApi.alerts(signal);
const loadAutomation = (signal: AbortSignal) => notificationsApi.automationStatus(signal);
export function useCommandCenter(staff: AuthStaff | null, key: string, today: string) {
  const admin = staff?.role === "ADMIN";
  const canFinance = admin && hasPermissions(staff, "cash-closings.manage");
  const canEquipment = admin && hasPermissions(staff, "equipment.manage");
  const canRetail = admin && hasPermissions(staff, "retail.manage");
  const canAutomation = admin && hasPermissions(staff, "settings.manage");
  const canOwnSales = staff?.role === "RECEPTIONIST" && hasPermissions(staff, "retail.sales.read");
  const loadCash = useCallback(async (signal: AbortSignal) => collectionSnapshot(await financialApi.getDay(today, signal), today), [today]);
  const loadRetail = useCallback((signal: AbortSignal) => retailApi.dashboard({ from: addCalendarDays(today, -6), to: today }, signal), [today]);
  const loadOwnSales = useCallback((signal: AbortSignal) => retailApi.sales({ from: today, to: today, page: 1, limit: 3 }, signal), [today]);
  const cash = useDashboardResource(canFinance, key, loadCash);
  const equipment = useDashboardResource(canEquipment, key, loadEquipment);
  const faults = useDashboardResource(canEquipment, key, loadFaults);
  const retail = useDashboardResource(canRetail, key, loadRetail);
  const automation = useDashboardResource(canAutomation, key, loadAutomation);
  const ownSales = useDashboardResource(canOwnSales, key, loadOwnSales);
  return { canFinance, canEquipment, canRetail, canAutomation, canOwnSales, cash, equipment, faults, retail, automation, ownSales };
}
export type CommandCenter = ReturnType<typeof useCommandCenter>;
