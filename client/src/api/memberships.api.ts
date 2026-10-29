
import { api } from "./api";

import type {
  InitialEnrollmentPayload,
  MembershipHistoryResponse,
  MembershipResponse,
  MembershipSummaryResponse,
  RenewalPayload,
} from "../types/membership";

export const membershipsApi = {
  // POST /api/memberships
  async enroll(
    payload: InitialEnrollmentPayload
  ): Promise<MembershipResponse> {
    const response = await api.post<MembershipResponse>(
      "/memberships",
      payload
    );

    return response.data;
  },

  // POST /api/memberships/renew
  async renew(
    payload: RenewalPayload
  ): Promise<MembershipResponse> {
    const response = await api.post<MembershipResponse>(
      "/memberships/renew",
      payload
    );

    return response.data;
  },

  // GET /api/memberships/member/:memberId/summary
  async getSummary(
    memberId: string,
    signal?: AbortSignal
  ): Promise<MembershipSummaryResponse> {
    const response =
      await api.get<MembershipSummaryResponse>(
        `/memberships/member/${encodeURIComponent(memberId)}/summary`,
        { signal }
      );

    return response.data;
  },

  // GET /api/memberships/member/:memberId
  async getHistory(
    memberId: string,
    signal?: AbortSignal
  ): Promise<MembershipHistoryResponse> {
    const response =
      await api.get<MembershipHistoryResponse>(
        `/memberships/member/${encodeURIComponent(memberId)}`,
        { signal }
      );

    return response.data;
  },
};
