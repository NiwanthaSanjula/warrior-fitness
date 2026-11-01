import { api } from "./api";
import type { EquipmentFaultAlert } from "../types/equipment";
import type { EquipmentFields, EquipmentFilters, EquipmentHistory, EquipmentItem, EquipmentList, EquipmentResponse, EquipmentWork, IncidentStatus, InventoryResponse, MaintenanceDashboard, Severity, WorkAction, WorkAssignment, WorkInput, WorkStatus, EquipmentIncident } from "../types/equipment";
const path = (id: string) => `/equipment/${encodeURIComponent(id)}`;
type WithoutVersion<T> = T extends unknown ? Omit<T, "version"> : never;
export const equipmentApi = {
  async alerts(signal?: AbortSignal): Promise<{ success: boolean; data: EquipmentFaultAlert[] }> { return (await api.get("/equipment/alerts", { signal })).data; },
  async list(params: EquipmentFilters, signal?: AbortSignal): Promise<InventoryResponse> { return (await api.get("/equipment", { params, signal })).data; },
  async get(id: string, signal?: AbortSignal): Promise<EquipmentResponse> { return (await api.get(path(id), { signal })).data; },
  async history<K extends keyof EquipmentHistory>(id: string, kind: K, page: number, signal?: AbortSignal): Promise<EquipmentList<EquipmentHistory[K]>> { return (await api.get(`${path(id)}/history`, { params: { kind, page, limit: 10 }, signal })).data; },
  async create(input: EquipmentFields & { assetId: string }): Promise<EquipmentResponse> { return (await api.post("/equipment", input)).data; },
  async update(item: EquipmentItem, input: EquipmentFields): Promise<EquipmentResponse> { return (await api.put(path(item.id), { ...input, version: item.version })).data; },
  async status(item: EquipmentItem, status: EquipmentItem["status"], reason: string): Promise<EquipmentResponse> { return (await api.patch(`${path(item.id)}/status`, { status, reason, version: item.version })).data; },
  async report(item: EquipmentItem, input: { requestId: string; description: string; severity: Severity }): Promise<EquipmentResponse> { return (await api.post(`${path(item.id)}/incidents`, { ...input, version: item.version })).data; },
  async review(item: EquipmentItem, incidentId: string, action: "ACKNOWLEDGE" | "RESOLVE" | "DISMISS", notes: string): Promise<EquipmentResponse> { return (await api.patch(`${path(item.id)}/incidents/${encodeURIComponent(incidentId)}`, { action, notes, version: item.version })).data; },
  async createWork(item: EquipmentItem, input: Omit<WorkInput, "version">): Promise<EquipmentResponse> { return (await api.post(`${path(item.id)}/work-orders`, { ...input, version: item.version })).data; },
  async assign(item: EquipmentItem, workId: string, input: WorkAssignment): Promise<EquipmentResponse> { return (await api.patch(`${path(item.id)}/work-orders/${encodeURIComponent(workId)}/assignment`, { ...input, version: item.version })).data; },
  async transition(item: EquipmentItem, workId: string, input: WithoutVersion<WorkAction>): Promise<EquipmentResponse> { return (await api.post(`${path(item.id)}/work-orders/${encodeURIComponent(workId)}/transition`, { ...input, version: item.version })).data; },
  async linkExpense(item: EquipmentItem, workId: string, expenseId: string): Promise<EquipmentResponse> { return (await api.post(`${path(item.id)}/work-orders/${encodeURIComponent(workId)}/expenses`, { expenseId, version: item.version })).data; },
  async dashboard(page: number, signal?: AbortSignal): Promise<MaintenanceDashboard> { return (await api.get("/equipment/maintenance", { params: { page, limit: 10 }, signal })).data; },
  async works(status: WorkStatus | undefined, page: number, signal?: AbortSignal): Promise<EquipmentList<EquipmentWork>> { return (await api.get("/equipment/work-orders", { params: { status, page, limit: 10 }, signal })).data; },
  async incidents(status: IncidentStatus | undefined, severity: Severity | undefined, page: number, signal?: AbortSignal): Promise<EquipmentList<EquipmentIncident>> { return (await api.get("/equipment/incidents", { params: { status, severity, page, limit: 10 }, signal })).data; },
};
