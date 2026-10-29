
import { api } from "./api";

import type {
  CreatePlanPayload,
  UpdatePlanPayload,
  PlanStatusFilter,
  PlansListResponse,
  PlanResponse,
} from "../types/plan";

export const plansApi = {
  // GET /api/plans
  async getPlans(
    status: PlanStatusFilter = "active",
    signal?: AbortSignal
  ): Promise<PlansListResponse> {
    const response = await api.get<PlansListResponse>(
      "/plans",
      {
        params: { status },
        signal,
      }
    );

    return response.data;
  },

  // GET /api/plans/:id
  async getPlanById(
    id: string,
    signal?: AbortSignal
  ): Promise<PlanResponse> {
    const response = await api.get<PlanResponse>(
      `/plans/${encodeURIComponent(id)}`,
      { signal }
    );

    return response.data;
  },

  // POST /api/plans
  async createPlan(
    payload: CreatePlanPayload
  ): Promise<PlanResponse> {
    const response = await api.post<PlanResponse>(
      "/plans",
      payload
    );

    return response.data;
  },

  // PATCH /api/plans/:id
  async updatePlan(
    id: string,
    payload: UpdatePlanPayload
  ): Promise<PlanResponse> {
    const response = await api.patch<PlanResponse>(
      `/plans/${encodeURIComponent(id)}`,
      payload
    );

    return response.data;
  },

  // PATCH /api/plans/:id/status
  async updatePlanStatus(
    id: string,
    isActive: boolean
  ): Promise<PlanResponse> {
    const response = await api.patch<PlanResponse>(
      `/plans/${encodeURIComponent(id)}/status`,
      { isActive }
    );

    return response.data;
  },
};
