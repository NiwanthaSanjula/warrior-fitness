
import { api } from "./api";

import type {
  ExpiringMembershipResponse,
  OutstandingPaymentResponse,
  AttendanceInactivityResponse,
} from "../types/attention";

interface PaginationParams {
  page?: number;
  limit?: number;
}

interface ExpiringParams extends PaginationParams {
  days?: number;
}

interface OutstandingParams extends PaginationParams {
  status?: "all" | "overdue";
  search?: string;
}

interface InactivityParams extends PaginationParams {
  days?: number;
  search?: string;
}

export const attentionApi = {
  async getExpiring(
    params: ExpiringParams = {},
    signal?: AbortSignal
  ): Promise<ExpiringMembershipResponse> {
    const response =
      await api.get<ExpiringMembershipResponse>(
        "/attention/expiring",
        { params, signal }
      );

    return response.data;
  },

  async getOutstanding(
    params: OutstandingParams = {},
    signal?: AbortSignal
  ): Promise<OutstandingPaymentResponse> {
    const response =
      await api.get<OutstandingPaymentResponse>(
        "/attention/outstanding",
        { params, signal }
      );

    return response.data;
  },

  async getInactiveAttendance(
    params: InactivityParams = {},
    signal?: AbortSignal
  ): Promise<AttendanceInactivityResponse> {
    const response =
      await api.get<AttendanceInactivityResponse>(
        "/attention/inactive-attendance",
        { params, signal }
      );

    return response.data;
  },
};
