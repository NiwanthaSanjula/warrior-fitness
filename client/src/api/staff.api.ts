import { api } from "./api";
import type { Permission } from "../auth/permissions";
import type { CreateStaffInput, StaffAuditResponse, StaffCatalogue, StaffDirectory, StaffFilters, StaffResult } from "../types/staff";

export const staffApi = {
  async getStaff(params: StaffFilters, signal?: AbortSignal): Promise<StaffDirectory> {
    return (await api.get<StaffDirectory>("/staff", { params, signal })).data;
  },
  async getById(id: string, signal?: AbortSignal): Promise<StaffResult> {
    return (await api.get<StaffResult>(`/staff/${encodeURIComponent(id)}`, { signal })).data;
  },
  async getCatalogue(signal?: AbortSignal): Promise<StaffCatalogue> {
    return (await api.get<StaffCatalogue>("/staff/permissions", { signal })).data;
  },
  async createStaff(input: CreateStaffInput): Promise<StaffResult> {
    return (await api.post<StaffResult>("/staff", input)).data;
  },
  async updateProfile(id: string, input: { fullName: string; email: string; expectedVersion: number }): Promise<StaffResult> {
    return (await api.patch<StaffResult>(`/staff/${encodeURIComponent(id)}/profile`, input)).data;
  },
  async updatePermissions(id: string, input: { permissions: Permission[] | null; expectedVersion: number }): Promise<StaffResult> {
    return (await api.patch<StaffResult>(`/staff/${encodeURIComponent(id)}/permissions`, input)).data;
  },
  async updateStatus(id: string, input: { isActive: boolean; expectedVersion: number }): Promise<StaffResult> {
    return (await api.patch<StaffResult>(`/staff/${encodeURIComponent(id)}/status`, input)).data;
  },
  async resetPassword(id: string, input: { password: string; expectedVersion: number }): Promise<StaffResult> {
    return (await api.post<StaffResult>(`/staff/${encodeURIComponent(id)}/reset-password`, input)).data;
  },
  async getAudit(params: { targetId?: string; page?: number; limit?: number }, signal?: AbortSignal): Promise<StaffAuditResponse> {
    return (await api.get<StaffAuditResponse>("/staff/audit", { params, signal })).data;
  },
};
