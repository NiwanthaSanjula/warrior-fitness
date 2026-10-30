
import { api } from "./api";

import type {
  ExpiringMembershipResponse,
  OutstandingPaymentResponse,
  AttendanceInactivityResponse,
  FollowUpType,
  CreateFollowUpPayload,
  CreateFollowUpResponse,
  MemberFollowUpsResponse,
  DueFollowUpsResponse,
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

interface MemberFollowUpParams extends PaginationParams {
  alertType?: FollowUpType | "all";
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

  async createFollowUp(
    payload: CreateFollowUpPayload
  ): Promise<CreateFollowUpResponse> {
    const response =
      await api.post<CreateFollowUpResponse>(
        "/attention/follow-ups",
        payload
      );

    return response.data;
  },

  async getMemberFollowUps(
    memberId: string,
    params: MemberFollowUpParams = {},
    signal?: AbortSignal
  ): Promise<MemberFollowUpsResponse> {
    const response =
      await api.get<MemberFollowUpsResponse>(
        `/attention/follow-ups/member/${encodeURIComponent(memberId)}`,
        { params, signal }
      );

    return response.data;
  },

  async getDueFollowUps(
    params: PaginationParams = {},
    signal?: AbortSignal
  ): Promise<DueFollowUpsResponse> {
    const response =
      await api.get<DueFollowUpsResponse>(
        "/attention/follow-ups/due",
        { params, signal }
      );

    return response.data;
  },
};
