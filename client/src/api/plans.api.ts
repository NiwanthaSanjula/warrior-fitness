
import { api } from "./api";

import type {
  PlanStatusFilter,
  PlansListResponse,
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
};
