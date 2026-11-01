export const equipmentStatuses = { OPERATIONAL: "Operational", UNDER_MAINTENANCE: "Under maintenance", OUT_OF_SERVICE: "Out of service", RETIRED: "Retired" } as const;
export const equipmentCategories = { CARDIO: "Cardio", STRENGTH: "Strength machines", FREE_WEIGHTS: "Free weights", FUNCTIONAL: "Functional", ACCESSORIES: "Accessories", OTHER: "Other" } as const;
export type EquipmentStatus = keyof typeof equipmentStatuses;
export type EquipmentCategory = keyof typeof equipmentCategories;
export interface EquipmentFields {
  name: string; category: EquipmentCategory; brand: string; model: string; serialNumber: string; location: string;
  purchaseDate: string | null; purchasePriceLkr: number | null; warrantyExpiry: string | null; intervalDays: number | null; nextServiceDate: string | null;
}
export interface EquipmentItem extends Omit<EquipmentFields, "purchasePriceLkr"> { id: string; assetId: string; status: EquipmentStatus; version: number; purchasePriceLkr?: number | null }
export interface EquipmentPagination { page: number; limit: number; total: number; totalPages: number }
export interface EquipmentList<T> { success: boolean; data: T[]; pagination: EquipmentPagination }
export interface EquipmentFilters { q?: string; status?: EquipmentStatus; category?: EquipmentCategory; location?: string; page?: number; limit?: number }
export interface InventoryResponse extends EquipmentList<EquipmentItem> { statistics: { total: number; operational: number; underMaintenance: number; outOfService: number; retired: number } }
export interface EquipmentResponse { success: boolean; equipment: EquipmentItem; replayed?: boolean }
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
export interface EquipmentIncident { id: string; equipmentId: string; description: string; severity: Severity; status: IncidentStatus; reporterName: string; reportedAt: string; closedAt: string | null; reviewNotes?: string }
export interface EquipmentFaultAlert { id: string; equipmentId: string; equipmentName: string; assetId: string | null; description: string; severity: Severity; status: "OPEN" | "ACKNOWLEDGED"; reportedAt: string }
export type WorkStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export interface WorkAssignment { technician: string; provider: string; contact: string; estimatedCostLkr: number | null }
export interface WorkInput extends WorkAssignment { title: string; kind: "PREVENTIVE" | "REPAIR"; plannedDate: string; incidentId: string | null; notes: string; version: number }
export interface EquipmentWork extends Partial<WorkAssignment> { id: string; equipmentId: string; assetId: string; equipmentName: string; incidentId: string | null; title: string; kind: "PREVENTIVE" | "REPAIR"; status: WorkStatus; plannedDate: string; createdAt: string; createdByName: string; startedAt: string | null; completedAt: string | null; notes?: string; repairNotes?: string; cancellationReason?: string; linkedExpenses?: { id: string; category: string; description: string; amountLkr: number; expenseDate: string }[] }
export interface EquipmentDowntime { id: string; startedAt: string; endedAt: string | null; isOpen: boolean; reason: string; recordedByName: string; durationMinutes: number }
export interface EquipmentEvent { id: string; action: string; notes: string; actorName: string; recordedAt: string }
export interface EquipmentHistory { incidents: EquipmentIncident; "work-orders": EquipmentWork; downtime: EquipmentDowntime; events: EquipmentEvent }
export interface MaintenanceDashboard { success: boolean; asOfDate: string; statistics: { overdue: number; dueToday: number; activeWork: number; openIncidents: number; unavailable: number }; queue: EquipmentItem[]; pagination: EquipmentPagination }
export type WorkAction = { action: "START"; version: number } | { action: "CANCEL"; reason: string; version: number } | { action: "COMPLETE"; repairNotes: string; returnToService: boolean; nextServiceDate?: string | null; version: number };
